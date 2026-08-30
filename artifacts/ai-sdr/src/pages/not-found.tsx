import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-[#f7f3e9] px-4">
      <Card className="w-full max-w-md mx-4 border-[#d8d6cf] bg-[#fffdfa] shadow-none">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-[#c74b45]" />
            <h1 className="text-2xl font-bold text-[#172b3a]">Page not found</h1>
          </div>

          <p className="mt-4 text-sm text-[#65727a]">
            This page has moved or is no longer available.
          </p>
          <Link href="/" className="mt-6 inline-flex rounded-lg bg-[#234d73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183b59] focus:outline-none focus:ring-2 focus:ring-[#234d73] focus:ring-offset-2">Return home</Link>
        </CardContent>
      </Card>
    </div>
  );
}
