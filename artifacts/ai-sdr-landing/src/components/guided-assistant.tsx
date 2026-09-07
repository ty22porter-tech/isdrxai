import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight } from "lucide-react";
import treyProfile from "../assets/trey-profile.png";

const APP_ORIGIN = window.location.origin;
const SIGN_IN_URL = `${APP_ORIGIN}/app/sign-in`;

const QA_TREE = {
  root: {
    message: "Hi, I'm Trey. I can help you understand how iSDRX AI finds prospects, personalizes outreach, tracks engagement, and helps book meetings. What would you like to explore?",
    links: [
      { label: "Existing user sign in", href: SIGN_IN_URL }
    ],
    options: [
      { label: "About iSDRX AI", target: "about" },
      { label: "Features & Capabilities", target: "features" },
      { label: "Pricing & Services", target: "pricing_menu" },
      { label: "Working with your team", target: "team_menu" },
      { label: "I'd like to see it in action", target: "demo" },
      { label: "I have another question", target: "contact" }
    ]
  },
  about: {
    message: "iSDRX AI is an AI-powered Sales Development Representative. What would you like to know?",
    options: [
      { label: "What is iSDRX AI?", target: "what_is" },
      { label: "How does it find customers?", target: "how_find" },
      { label: "Who can use it?", target: "who_use" },
      { label: "Does it replace salespeople?", target: "replace" },
      { label: "Back to main menu", target: "root" }
    ]
  },
  what_is: {
    message: "iSDRX AI is an AI-powered Sales Development Representative that helps businesses research prospects, identify buying signals, create personalized outreach, manage follow-up campaigns, and schedule appointments directly on the sales team's calendar.",
    options: [
      { label: "How does it help my team?", target: "how_help" },
      { label: "More about iSDRX AI", target: "about" }
    ]
  },
  how_help: {
    message: "It handles time-consuming prospecting activities so your sales professionals can focus on conversations, presentations, and closing business. It helps keep your pipeline active without requiring your team to spend hours researching.",
    options: [
      { label: "Does it replace salespeople?", target: "replace" },
      { label: "More about iSDRX AI", target: "about" }
    ]
  },
  replace: {
    message: "No. iSDRX AI supports your sales team by handling many of the repetitive tasks normally performed at the beginning of the sales process. Your sales professionals remain responsible for building relationships, conducting discovery meetings, presenting solutions, and closing opportunities.",
    options: [
      { label: "Can it help if we have an open position?", target: "open_position" },
      { label: "More about iSDRX AI", target: "about" }
    ]
  },
  open_position: {
    message: "Yes. iSDRX AI can begin prospecting and generating engagement while you recruit, hire, and train a new SDR. It can also continue supporting the new employee after the position is filled.",
    options: [
      { label: "More about iSDRX AI", target: "about" }
    ]
  },
  team_menu: {
    message: "Trey can explain how iSDRX AI fits into your existing sales process and technology. What would you like to know?",
    options: [
      { label: "Can it help with an open sales position?", target: "open_position" },
      { label: "Will it automatically close sales?", target: "close_sales" },
      { label: "Can it work with our CRM?", target: "crm" },
      { label: "Can we use our own campaign materials?", target: "logo_sig" },
      { label: "Is it available 24/7?", target: "availability" },
      { label: "Back to main menu", target: "root" }
    ]
  },
  close_sales: {
    message: "No. iSDRX AI is designed to improve prospecting, engagement, and appointment generation. Sales results also depend on your offer, market demand, pricing, sales process, follow-up, and your team's ability to convert opportunities.",
    options: [
      { label: "Working with your team", target: "team_menu" }
    ]
  },
  crm: {
    message: "CRM compatibility depends on the system your company uses and the selected package. During your consultation, the iSDRX AI team will review your current technology and recommend the best configuration.",
    options: [
      { label: "Working with your team", target: "team_menu" }
    ]
  },
  availability: {
    message: "AI-powered research, campaign, and engagement-tracking features can operate continuously. Live calling services are performed during approved calling hours based on your campaign and target market.",
    options: [
      { label: "Working with your team", target: "team_menu" }
    ]
  },
  who_use: {
    message: "It can be customized for many B2B industries, including commercial cleaning, IT services, property management, healthcare, manufacturing, professional services, commercial fleet graphics, and construction.",
    options: [
      { label: "More about iSDRX AI", target: "about" }
    ]
  },
  how_find: {
    message: "iSDRX AI uses your ideal customer profile, target industries, geographic market, company characteristics, job openings, leadership information, and other relevant business signals to help identify companies that may be a good fit for your services.",
    options: [
      { label: "What are buying signals?", target: "buying_signals" },
      { label: "More about iSDRX AI", target: "about" }
    ]
  },
  features: {
    message: "iSDRX AI automates the heavy lifting of prospecting and outreach. What feature would you like to learn about?",
    options: [
      { label: "Personalized emails", target: "personalize" },
      { label: "Follow-up campaigns", target: "follow_up" },
      { label: "Buying signals & tracking", target: "buying_signals" },
      { label: "Reviewing emails before sending", target: "review" },
      { label: "Back to main menu", target: "root" }
    ]
  },
  personalize: {
    message: "Yes. iSDRX AI uses available information about the prospect, company, industry, and possible business needs to create relevant one-to-one messages. The emails are designed to sound professional and natural instead of reading like generic mass marketing.",
    options: [
      { label: "Can we use our own logo or signature?", target: "logo_sig" },
      { label: "More features", target: "features" }
    ]
  },
  logo_sig: {
    message: "Yes. Your campaign can include a customized email signature, company logo, calendar link, website link, flyer, case study, audio message, or video when appropriate.",
    options: [
      { label: "More features", target: "features" }
    ]
  },
  review: {
    message: "Yes. You can preview the email style, messaging, offer, call to action, signature, logo, and supporting attachments during campaign preparation. Once the campaign is approved and activated, iSDRX AI can automate the outreach sequence.",
    options: [
      { label: "More features", target: "features" }
    ]
  },
  follow_up: {
    message: "Yes. iSDRX AI can support structured multi-step campaigns that include the initial introduction, follow-up messages, helpful resources, case studies, videos, and a final breakup email.",
    options: [
      { label: "Can prospects schedule appointments?", target: "schedule" },
      { label: "More features", target: "features" }
    ]
  },
  schedule: {
    message: "Yes. Your calendar link can be included in the outreach so interested prospects can schedule an appointment directly with the appropriate sales professional.",
    options: [
      { label: "More features", target: "features" }
    ]
  },
  buying_signals: {
    message: "Buying signals are activities or business changes that may indicate a company has a potential need. Examples include hiring activity, company growth, leadership changes, new locations, operational challenges, expansion announcements, or increased engagement with your outreach.",
    options: [
      { label: "How does it track engagement?", target: "tracking" },
      { label: "More features", target: "features" }
    ]
  },
  tracking: {
    message: "iSDRX AI monitors engagement activity such as email opens, repeat opens, link clicks, website visits, attachment views, video engagement, and calendar-link activity. These signals help identify hot, warm, and lower-engagement prospects for follow-up.",
    options: [
      { label: "More features", target: "features" }
    ]
  },
  pricing_menu: {
    message: "We offer self-service software, managed calling services, and a required setup package. What would you like to know?",
    options: [
      { label: "How much does it cost?", target: "pricing" },
      { label: "What does setup include?", target: "setup" },
      { label: "Do you offer telephone follow-up?", target: "telephone" },
      { label: "Back to main menu", target: "root" }
    ]
  },
  pricing: {
    message: "Self-service plans start at $249 per month. Buy Now begins billing at checkout, or eligible first-time subscribers can explicitly choose a 14-day trial. Every subscription also includes the required one-time $995 AI Sales Launch Package.",
    links: [
      { label: "View Pricing", href: "/#plans" }
    ],
    options: [
      { label: "What does the setup process include?", target: "setup" },
      { label: "Back to Pricing & Services", target: "pricing_menu" }
    ]
  },
  setup: {
    message: "Setup includes defining your ideal customer profile, selecting industries/locations, developing messaging, configuring your CRM and calendar, preparing email sequences, testing workflows, and training your team.",
    options: [
      { label: "Is there a setup fee?", target: "setup_fee" },
      { label: "How quickly can we get started?", target: "timeline" },
      { label: "Back to Pricing & Services", target: "pricing_menu" }
    ]
  },
  setup_fee: {
    message: "Yes, every subscription includes the required one-time $995 AI Sales Launch Package. Some enhanced services or iSDRX AI+ calling programs may require a different setup fee based on the level of preparation involved.",
    options: [
      { label: "Back to Pricing & Services", target: "pricing_menu" }
    ]
  },
  timeline: {
    message: "The timeline depends on the selected package, campaign requirements, integrations, and availability of your sales materials. Setup generally includes strategy development, scripting, CRM configuration, campaign preparation, targeting, testing, and training.",
    options: [
      { label: "Back to Pricing & Services", target: "pricing_menu" }
    ]
  },
  telephone: {
    message: "Telephone outreach is available through iSDRX AI+ as an optional add-on. Available service levels include engagement follow-up, outbound calling, a dedicated caller, and additional callers for expanded territories or higher call volume.",
    links: [
      { label: "Contact Sales", href: "/contact-us" }
    ],
    options: [
      { label: "Back to Pricing & Services", target: "pricing_menu" }
    ]
  },
  demo: {
    message: "The best way to see the platform is to watch our recorded walkthrough or schedule a personalized demo with our team.",
    links: [
      { label: "Book a Demo", href: "/book-demo" }
    ],
    options: [
      { label: "Back to main menu", target: "root" }
    ]
  },
  contact: {
    message: "We're Here to Help\n\nI'm sorry, but I don't have enough information to answer that question. Please submit your email address and question below, and a member of the iSDRX AI team will get back to you.",
    isContactForm: true,
    options: [
      { label: "Back to main menu", target: "root" }
    ]
  }
} as const;

type NodeId = keyof typeof QA_TREE;

type ChatMessage = {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
  links?: { label: string; href: string }[];
  isContactForm?: boolean;
};

function AssistantContactForm() {
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [website, setWebsite] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !question) {
      setError('Please provide an email and your question.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/contact-us/unanswered-question', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, question, website })
      });

      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.error || 'Your question could not be submitted. Please try again.');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-xl">
        <p className="text-sm text-primary font-medium">
          Thank you! Your question has been submitted. A member of the iSDRX AI team will contact you by email as soon as possible.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="assistant-email" className="text-xs font-medium text-white/80">Email Address</label>
        <input
          id="assistant-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="you@company.com"
          maxLength={320}
          autoComplete="email"
          required
        />
      </div>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="assistant-website">Website</label>
        <input
          id="assistant-website"
          type="text"
          value={website}
          onChange={e => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="assistant-question" className="text-xs font-medium text-white/80">Your Question</label>
        <textarea
          id="assistant-question"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary min-h-[80px] resize-none"
          placeholder="What would you like to know?"
          maxLength={2000}
          required
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-primary hover:bg-primary/90 text-white text-sm font-medium py-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-card disabled:opacity-50"
      >
        {isSubmitting ? 'Sending...' : 'Contact Us'}
      </button>
    </form>
  );
}

export function GuidedAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentNode, setCurrentNode] = useState<NodeId>('root');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      sender: 'assistant',
      text: QA_TREE.root.message,
      links: (QA_TREE.root as any).links,
      isContactForm: (QA_TREE.root as any).isContactForm
    }
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleOptionClick = (option: { label: string; target: NodeId }) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString() + '-user',
      sender: 'user',
      text: option.label
    };

    const targetNode = QA_TREE[option.target];
    const assistantMsg: ChatMessage = {
      id: Date.now().toString() + '-assistant',
      sender: 'assistant',
      text: targetNode.message,
      links: (targetNode as any).links,
      isContactForm: (targetNode as any).isContactForm
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setCurrentNode(option.target);
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 h-16 rounded-full bg-primary text-white shadow-[0_0_24px_rgba(37,99,235,0.55)] flex items-center gap-2 border border-white/20 p-1.5 pr-5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-background"
            aria-label="Open Trey Assistant"
          >
            <div className="w-13 h-13 rounded-full overflow-hidden border border-white/30 shrink-0">
              <img src={treyProfile} alt="" className="w-full h-full object-cover" />
            </div>
            <span className="font-semibold text-sm whitespace-nowrap">Ask Trey</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[400px] h-[650px] max-h-[calc(100vh-5rem)] bg-card border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guided-assistant-title"
          >
            {/* Header */}
            <div className="h-16 px-4 bg-white/[0.03] border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-white/10">
                  <img src={treyProfile} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 id="guided-assistant-title" className="font-semibold text-sm text-white">Trey</h3>
                  <p className="text-[11px] text-muted-foreground">iSDRX AI Assistant</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-md hover:bg-white/10 text-muted-foreground hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Close assistant"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat History */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.sender === 'assistant' && (
                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/10 mt-1">
                      <img src={treyProfile} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                      msg.sender === 'user'
                        ? 'bg-primary text-white rounded-tr-sm'
                        : 'bg-white/5 border border-white/10 text-gray-300 rounded-tl-sm'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                    {msg.isContactForm && <AssistantContactForm />}

                    {msg.links && msg.links.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.links.map((link, idx) => (
                          <a
                            key={idx}
                            href={link.href}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-xs font-medium transition-colors border border-primary/20"
                          >
                            {link.label} <ChevronRight className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Options */}
            <div className="p-4 bg-white/[0.02] border-t border-white/10 shrink-0">
              <div className="flex flex-col gap-2">
                {QA_TREE[currentNode].options.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleOptionClick(opt as any)}
                    className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-sm font-medium text-white flex items-center justify-between group focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <span>{opt.label}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors" />
                  </button>
                ))}
                {currentNode !== 'contact' && (
                  <button
                    onClick={() => handleOptionClick({ label: "Trey didn't answer my question", target: "contact" })}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-muted-foreground hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded-lg"
                  >
                    Trey didn't answer my question
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
