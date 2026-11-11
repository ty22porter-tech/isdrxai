import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AskIsdrxAI } from "./ask-isdrx-ai";
const confirmation = "Your question has been sent to support. We’ll respond within 24 hours, seven days a week.";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());
function open() {
  render(<AskIsdrxAI email="owner@example.test" location="/prospecting" />);
  fireEvent.click(screen.getByRole("button", { name: "Ask iSDRX AI" }));
}
function ask(text = "What does Possible Fit mean?") {
  fireEvent.change(screen.getByLabelText("Ask about iSDRX AI"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Ask", exact: true }));
}

it("opens from one button, answers from guide sources, and does not automatically email support", async () => {
  fetchMock.mockResolvedValue(json({ answered: true, answer: "Possible Fit requires further qualification; it is not purchase probability.", sources: [{ title: "Fit scores", href: "/help#fit-scores-what-they-mean-and-how-to-use-them" }] }));
  open(); ask();
  expect(await screen.findByText(/Possible Fit requires further qualification/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Fit scores" })).toHaveAttribute("href", expect.stringContaining("/help#fit-scores"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ question: "What does Possible Fit mean?", page: "Prospect Search" });
  expect(screen.queryByLabelText("Your reply email")).not.toBeInTheDocument();
});

it("prefills an editable support form and waits for successful delivery before promising a response", async () => {
  let acknowledge!: (value: Response) => void;
  fetchMock.mockResolvedValueOnce(json({ answered: false, answer: "The guide does not establish an answer.", sources: [] })).mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
  open(); ask("Can you fix my account issue?");
  expect(await screen.findByLabelText("Your reply email")).toHaveValue("owner@example.test");
  expect(screen.getByLabelText("Your question for support")).toHaveValue("Can you fix my account issue?");
  fireEvent.change(screen.getByLabelText("Your question for support"), { target: { value: "Please help with my account configuration." } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Support" }));
  expect(screen.queryByText(confirmation)).not.toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  acknowledge(json({ ok: true, message: confirmation }));
  expect(await screen.findByText(confirmation)).toBeInTheDocument();
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body.question).toBe("Please help with my account configuration.");
  expect(body.email).toBe("owner@example.test");
  expect(body).not.toHaveProperty("transcript");
  expect(screen.queryByRole("button", { name: "Send to Support" })).not.toBeInTheDocument();
});

it("retains the question on a failed send and reuses its idempotency key on retry", async () => {
  fetchMock.mockResolvedValueOnce(json({ answered: false, answer: "Contact support", sources: [] }))
    .mockResolvedValueOnce(json({ error: "Your question could not be sent. Please retry." }, 502))
    .mockResolvedValueOnce(json({ ok: true, message: confirmation }));
  open(); ask("I need help with my account.");
  await screen.findByLabelText("Your reply email");
  fireEvent.click(screen.getByRole("button", { name: "Send to Support" }));
  expect(await screen.findByText("Your question could not be sent. Please retry.")).toBeInTheDocument();
  expect(screen.getByLabelText("Your question for support")).toHaveValue("I need help with my account.");
  expect(screen.queryByText(confirmation)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Send to Support" }));
  await screen.findByText(confirmation);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).requestKey).toBe(JSON.parse(fetchMock.mock.calls[2][1].body).requestKey);
});

it("offers support when the help service is unavailable and does not display HTML gateway errors", async () => {
  fetchMock.mockResolvedValue(new Response("<!doctype html><title>Starting</title>", { status: 502 }));
  open(); ask();
  expect(await screen.findByLabelText("Your question for support")).toHaveValue("What does Possible Fit mean?");
  expect(screen.getByRole("alert").textContent).not.toContain("doctype");
});
