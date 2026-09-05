import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Sparkles, ChevronRight } from "lucide-react";

const APP_ORIGIN = window.location.origin;
const SIGN_IN_URL = `${APP_ORIGIN}/app/sign-in`;

const QA_TREE = {
  root: {
    message: "Hello. I can help you understand how iSDRX AI finds prospects, personalizes outreach, tracks engagement, and helps book meetings. What would you like to explore?",
    options: [
      { label: "How does the AI prospecting work?", target: "prospecting" },
      { label: "What is the pricing?", target: "pricing" },
      { label: "Do you offer full-service management?", target: "managed" },
      { label: "I'd like to see it in action", target: "demo" },
      { label: "I'm an existing user", target: "signin" }
    ]
  },
  prospecting: {
    message: "Use Prospect Search or upload a CSV to build a targeted list. iSDRX AI researches each business and uses details from its website and business type to create personalized outreach.",
    options: [
      { label: "How does it handle follow-ups?", target: "followups" },
      { label: "Back to topics", target: "root" }
    ]
  },
  followups: {
    message: "Multi-step campaigns space out follow-up messages automatically. Sequences pause when a prospect replies or books, while engagement and buying signals stay visible in your dashboard.",
    options: [
      { label: "See a demo of this", target: "demo" },
      { label: "Back to topics", target: "root" }
    ]
  },
  pricing: {
    message: "Self-service plans start at $249 per month. Buy Now begins billing at checkout, or eligible first-time subscribers can explicitly choose a 14-day trial. Every subscription also includes the required one-time $995 AI Sales Launch Package.",
    links: [
      { label: "View Pricing", href: "/#plans" }
    ],
    options: [
      { label: "Do you offer full-service management?", target: "managed" },
      { label: "Back to topics", target: "root" }
    ]
  },
  managed: {
    message: "iSDRX AI+ adds professional human calling to your selected plan. Callers follow up with interested prospects, qualify interest, arrange live transfers or appointments, and record outcomes in the dashboard.",
    links: [
      { label: "Contact Sales", href: "/contact-us" }
    ],
    options: [
      { label: "Back to topics", target: "root" }
    ]
  },
  demo: {
    message: "The best way to see the platform is to watch our recorded walkthrough or schedule a personalized demo with our team.",
    links: [
      { label: "Book a Demo", href: "/book-demo" }
    ],
    options: [
      { label: "Back to topics", target: "root" }
    ]
  },
  signin: {
    message: "Welcome back! You can sign in to your dashboard here.",
    links: [
      { label: "Sign In", href: SIGN_IN_URL }
    ],
    options: [
      { label: "Back to topics", target: "root" }
    ]
  }
} as const;

type NodeId = keyof typeof QA_TREE;

type ChatMessage = {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
  links?: { label: string; href: string }[];
};

export function GuidedAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentNode, setCurrentNode] = useState<NodeId>('root');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      sender: 'assistant',
      text: QA_TREE.root.message,
      links: (QA_TREE.root as any).links
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
      links: (targetNode as any).links
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
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 rounded-full bg-primary text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center border border-white/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-background"
            aria-label="Open iSDRX Assistant"
          >
            <MessageSquare className="w-6 h-6" />
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
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[380px] h-[600px] max-h-[calc(100vh-5rem)] bg-card border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guided-assistant-title"
          >
            {/* Header */}
            <div className="h-16 px-4 bg-white/[0.03] border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 id="guided-assistant-title" className="font-semibold text-sm text-white">iSDRX Assistant</h3>
                  <p className="text-[10px] text-muted-foreground">Automated Guide</p>
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
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.sender === 'user'
                        ? 'bg-primary text-white rounded-tr-sm'
                        : 'bg-white/5 border border-white/10 text-gray-300 rounded-tl-sm'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    
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
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
