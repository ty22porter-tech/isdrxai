import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";

const EFFECTIVE_DATE = "September 5, 2026";

function LegalPage({
  title,
  description,
  children,
  effectiveDate = EFFECTIVE_DATE,
}: {
  title: string;
  description: string;
  children: ReactNode;
  effectiveDate?: string;
}) {
  useEffect(() => {
    document.title = `${title} | iSDRX AI`;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = description;
    window.scrollTo(0, 0);
  }, [title, description]);

  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground sm:py-16">
      <article className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-medium text-accent transition-colors hover:text-white">
          ← Back to iSDRX AI
        </Link>
        <div className="mt-8 rounded-2xl border border-white/10 bg-card p-6 shadow-2xl sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Legal</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Effective date: {effectiveDate}</p>
          <div className="prose prose-invert mt-10 max-w-none prose-headings:font-display prose-headings:text-white prose-a:text-accent prose-strong:text-white">
            {children}
          </div>
        </div>
        <nav className="mt-8 flex flex-wrap justify-center gap-5 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-white">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/acceptable-use" className="hover:text-white">Acceptable Use Policy</Link>
        </nav>
      </article>
    </main>
  );
}

export function TermsOfServicePage() {
  return (
    <LegalPage
      effectiveDate="October 24, 2026"
      title="Terms of Service"
      description="Terms governing access to and use of iSDRX AI services."
    >
      <p>
        These Terms of Service (“Terms”) form a binding agreement between you or the organization
        you represent (“Customer,” “you,” or “your”) and iSDRX AI Inc. (“iSDRX AI,” “we,” “us,” or
        “our”). By creating an account, accepting these Terms, or using the Services, you agree to
        these Terms, our <Link href="/privacy">Privacy Policy</Link>, and our{" "}
        <Link href="/acceptable-use">Acceptable Use Policy</Link>.
      </p>

      <h2>1. Eligibility and accounts</h2>
      <p>
        You must be at least 18 years old and authorized to bind the Customer. You are responsible
        for accurate account information, account security, authorized users, and all activity
        occurring through your account. You must promptly notify us of suspected unauthorized use.
      </p>

      <h2>2. Services</h2>
      <p>
        iSDRX AI provides prospecting, AI-assisted content generation, campaign management,
        engagement tracking, appointment-booking, reporting, and related sales-support tools.
        Available features, limits, and support depend on the selected plan and order form. iSDRX
        AI+ may include professional calling support and is provided only after separate
        sales-assisted activation.
      </p>

      <h2>3. AI-generated content</h2>
      <p>
        The Services may generate research, recommendations, messages, or other content using
        artificial intelligence. AI output may be incomplete, inaccurate, or unsuitable for your
        intended use. You are responsible for reviewing and approving targeting, factual claims,
        representations, and outbound content before use. We do not guarantee leads, replies,
        appointments, conversions, sales, or revenue.
      </p>

      <h2>4. Fees, trials, and payment</h2>
      <p>
        Subscription fees are billed in advance according to the plan displayed at checkout or in
        an order form. Applicable taxes are additional. A 14-day trial is available only when you
        explicitly select the Start Free Trial option. A valid payment method is required, but no
        subscription or $995 AI Sales Launch Package fee is charged during the trial. If you
        continue after 14 days, the selected monthly subscription and one-time $995 Launch Package
        fee are charged when the trial ends. Cancel before then to avoid both charges. If you select
        Buy Now, billing begins when checkout is completed, including the $995 Launch Package fee.
      </p>
      <p>
        The one-time $995 AI Sales Launch Package is required for each new standard subscription.
        It includes account and domain configuration, DNS/email authentication, calendar integration,
        ICP and AI prompt customization, sales workflow, initial campaign and CRM setup, a live
        implementation session, and training. If AI+ is selected, the separate $1,000 AI+ onboarding
        fee may also apply. Launch, onboarding, implementation, and other one-time fees are
        nonrefundable once work begins, except where required by law or expressly stated in a signed
        order form.
      </p>

      <h2>5. Renewal and cancellation</h2>
      <p>
        Standard subscriptions automatically renew for successive monthly billing periods until
        canceled. You may cancel through the billing portal before your next renewal date.
        Cancellation stops future renewals and takes effect at the end of the current paid billing
        period. Fees already paid are nonrefundable, and we do not provide prorated refunds or
        credits for unused time, except where required by law.
      </p>
      <p>
        AI+ options are month-to-month. AI+ may be canceled by providing at least 30 days’ written
        notice. The Customer remains responsible for charges incurred through the effective
        cancellation date. Canceling AI+ does not automatically cancel the underlying iSDRX AI
        subscription.
      </p>

      <h2>6. Customer responsibilities</h2>
      <p>
        You are responsible for your prospect lists, campaign instructions, sending domains,
        scripts, claims, and use of the Services. You represent that you have all rights, notices,
        permissions, and consents necessary to provide Customer Data and contact each recipient.
        You must comply with CAN-SPAM, the Telephone Consumer Protection Act where applicable,
        the Telemarketing Sales Rule, Do-Not-Call requirements, privacy laws, call-recording and
        consent laws, and all other laws applicable to your outreach.
      </p>
      <p>
        You must use accurate sender and caller identification, honor opt-outs promptly, maintain
        suppression lists, and avoid contacting anyone who has withdrawn consent or requested no
        further contact. You may not instruct iSDRX AI or any caller to make unlawful,
        misleading, harassing, or deceptive communications.
      </p>

      <h2>7. Customer Data and privacy</h2>
      <p>
        You retain your rights in information, lists, content, and materials submitted to the
        Services (“Customer Data”). You grant us a limited right to host, process, transmit, and
        display Customer Data as necessary to provide, secure, support, and improve the Services.
        Our handling of personal information is described in our Privacy Policy. Where required,
        the parties may enter into a separate data processing addendum.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        We and our licensors retain all rights in the Services, software, designs, models,
        documentation, trademarks, and related technology. Subject to these Terms and payment of
        applicable fees, we grant you a limited, nonexclusive, nontransferable right to use the
        Services for your internal business purposes. You may not copy, resell, reverse engineer,
        scrape, or attempt to gain unauthorized access to the Services.
      </p>

      <h2>9. Third-party services</h2>
      <p>
        The Services may connect with third-party providers for payments, authentication, email,
        calendars, prospect information, AI processing, and other functions. Your use of those
        services may be governed by their terms. We are not responsible for third-party services
        or for interruptions, changes, or data handling outside our control.
      </p>

      <h2>10. Confidentiality</h2>
      <p>
        Each party will protect the other party’s nonpublic confidential information using
        reasonable care and will use it only to perform or receive the Services. This obligation
        does not apply to information that is public through no breach, already known without
        restriction, independently developed, or lawfully received from another source.
      </p>

      <h2>11. Suspension and termination</h2>
      <p>
        We may suspend or terminate access for nonpayment, unlawful conduct, security threats,
        material violations of these Terms or the Acceptable Use Policy, or conduct that creates
        material risk to recipients, iSDRX AI, or our providers. Either party may terminate an
        affected service for a material breach that remains uncured 30 days after written notice.
        We may act immediately when necessary to prevent fraud, abuse, unlawful outreach, or harm.
      </p>
      <p>
        Upon termination, access ends and outstanding fees become due. On request, we will provide
        a reasonable opportunity to export available Customer Data, unless prohibited by law or
        suspension resulted from unlawful activity. Payment, confidentiality, intellectual
        property, disclaimer, liability, indemnity, and other provisions intended by their nature
        to survive will remain in effect.
      </p>

      <h2>12. Service availability and changes</h2>
      <p>
        We may update features and limits or perform maintenance. We do not promise uninterrupted
        or error-free operation. If a change materially reduces a paid service, we will provide
        reasonable notice when practicable. Beta or preview features may be changed or withdrawn
        at any time.
      </p>

      <h2>13. Disclaimers</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICES ARE PROVIDED “AS IS” AND “AS
        AVAILABLE.” WE DISCLAIM ALL IMPLIED WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A
        PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT DELIVERABILITY,
        ACCURACY OF PROSPECT DATA OR AI OUTPUT, OR ANY PARTICULAR BUSINESS RESULT.
      </p>

      <h2>14. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS,
        REVENUE, DATA, OR BUSINESS OPPORTUNITIES. EACH PARTY’S TOTAL LIABILITY ARISING FROM THE
        SERVICES WILL NOT EXCEED THE AMOUNTS PAID OR PAYABLE BY CUSTOMER FOR THE AFFECTED SERVICES
        DURING THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM. THESE LIMITS DO NOT APPLY
        WHERE LIABILITY CANNOT LEGALLY BE LIMITED.
      </p>

      <h2>15. Indemnification</h2>
      <p>
        You will defend and indemnify iSDRX AI and its personnel against third-party claims, losses,
        penalties, and reasonable costs arising from Customer Data, your campaigns or calling
        instructions, unlawful contact with recipients, your violation of law, or your breach of
        these Terms. We will promptly notify you of a covered claim and reasonably cooperate in
        the defense.
      </p>

      <h2>16. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the State of Texas, without regard to conflict-of-law
        principles. The state and federal courts serving the county in which iSDRX AI maintains
        its principal office will have exclusive jurisdiction, and each party consents to that venue.
      </p>

      <h2>17. Changes and general terms</h2>
      <p>
        We may update these Terms. Material changes will be communicated through the Services,
        email, or another reasonable method and may require renewed acceptance. If any provision is
        unenforceable, the remaining provisions remain effective. Failure to enforce a provision is
        not a waiver. You may not assign these Terms without our consent; we may assign them in
        connection with a merger, reorganization, financing, or sale of assets.
      </p>

      <h2>18. Contact</h2>
      <p>
        Questions, cancellation notices, and legal notices may be sent to{" "}
        <a href="mailto:info@isdrxai.com">info@isdrxai.com</a>.
      </p>
    </LegalPage>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="How iSDRX AI collects, uses, discloses, and protects personal information."
    >
      <p>
        This Privacy Policy explains how iSDRX AI Inc. collects, uses, discloses, and protects
        personal information when you visit our website, create an account, or use our services.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li><strong>Account information:</strong> name, email, phone number, company, login identifiers, and preferences.</li>
        <li><strong>Billing information:</strong> subscription, transaction, and billing status. Payment card details are processed by our payment provider and are not stored by us.</li>
        <li><strong>Customer Data:</strong> prospect records, contact details, campaign content, sending-domain settings, calendar information, replies, engagement events, call outcomes, notes, transfers, and appointment information.</li>
        <li><strong>Usage and device information:</strong> pages viewed, actions taken, browser, device, IP address, timestamps, and diagnostic information.</li>
        <li><strong>Communications:</strong> information provided in support, demo, contact, and sales conversations.</li>
      </ul>

      <h2>2. How we use information</h2>
      <p>
        We use information to provide and secure the Services; authenticate users; process
        subscriptions; configure accounts; generate and deliver requested outreach; manage
        campaigns, replies, calling support, and appointments; provide analytics and support;
        prevent fraud and abuse; comply with law; and improve our products and operations.
      </p>

      <h2>3. How we disclose information</h2>
      <p>
        We may disclose information to service providers supporting hosting, authentication,
        payment processing, email delivery, calendar scheduling, prospect-data services, AI
        processing, communications, analytics, security, and customer support. We may also
        disclose information when directed by the Customer, in connection with a business
        transaction, to protect rights and safety, or when required by law.
      </p>
      <p>We do not sell personal information for money.</p>

      <h2>4. Customer responsibilities</h2>
      <p>
        Business customers determine which prospect and customer information they submit and how
        they use the Services. Customers are responsible for providing required notices, obtaining
        necessary permissions and consents, and responding to privacy requests relating to their
        outreach data. If your information was submitted by one of our customers, contact that
        customer first regarding your rights.
      </p>

      <h2>5. Cookies and similar technologies</h2>
      <p>
        We use cookies and similar technologies necessary for authentication, security, session
        continuity, preferences, analytics, and service performance. Browser settings may allow
        you to limit cookies, but disabling essential cookies may prevent the Services from working.
      </p>

      <p id="activity-linking">
        <strong>Opt-in visitor activity linking.</strong> Separately from our general anonymous
        analytics, you may turn on "Activity privacy" using the control at the bottom of our website
        and app. It is off by default. If you allow it, the pages you visit and key clicks you make
        (such as Book a Demo, Pricing, or Start Free Trial) in that browser may be linked to your
        signed-in account, or to the details you provide after you successfully submit our demo or
        contact form, and shown to iSDRX administrators. We record only the type of action and a
        general page category, never page addresses or query strings. You can revoke at any time by
        opening "Activity privacy" and choosing "Turn off &amp; remove session activity", which stops
        linking and removes the activity recorded for the current browser session. It does not
        remove activity from earlier sessions, your account, or demo, contact, or other business
        records you have submitted; to request those, contact us using the details below. Consent
        lasts up to 30 days. Signing out or switching accounts starts a new session so shared-browser
        activity is not attributed to a former account. If your browser sends a Global Privacy
        Control signal, we will not enable activity linking.
      </p>

      <h2>6. Data retention</h2>
      <p>
        We retain information for as long as reasonably necessary to provide the Services, maintain
        business and transaction records, resolve disputes, enforce agreements, and comply with
        legal obligations. Retention periods vary based on the information, its purpose, Customer
        instructions, and applicable law.
      </p>

      <h2>7. Security</h2>
      <p>
        We use reasonable administrative, technical, and organizational safeguards designed to
        protect information. No internet transmission or storage system is completely secure, and
        we cannot guarantee absolute security.
      </p>

      <h2>8. Your privacy choices</h2>
      <p>
        Depending on where you live, you may have rights to request access, correction, deletion,
        or a copy of personal information, or to object to or restrict certain processing. We may
        need to verify your identity and may retain information where permitted or required by law.
        You may unsubscribe from marketing communications using the instructions in the message.
      </p>

      <h2>9. Children</h2>
      <p>
        The Services are intended for businesses and are not directed to children under 13. We do
        not knowingly collect personal information from children under 13.
      </p>

      <h2>10. International processing</h2>
      <p>
        Information may be processed in the United States and other locations where we or our
        service providers operate. Those locations may have different data-protection laws than
        your jurisdiction.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy and will post the revised version with a new effective
        date. We will provide additional notice when required by law.
      </p>

      <h2>12. Contact</h2>
      <p>
        Privacy questions and requests may be sent to{" "}
        <a href="mailto:info@isdrxai.com">info@isdrxai.com</a>.
      </p>
    </LegalPage>
  );
}

export function AcceptableUsePolicyPage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      description="Rules for lawful and responsible use of iSDRX AI."
    >
      <p>
        This Acceptable Use Policy applies to all use of iSDRX AI. Customers are responsible for
        their users, prospect data, campaigns, scripts, instructions, and communications.
      </p>

      <h2>1. Use only authorized data</h2>
      <p>
        You may provide and use contact data only when you have a lawful basis and all required
        rights, notices, permissions, and consents. You may not use unlawfully obtained, stolen,
        scraped in violation of applicable rules, or sensitive personal data for outreach.
      </p>

      <h2>2. Follow outreach laws</h2>
      <p>
        You must comply with CAN-SPAM, applicable privacy and consumer-protection laws, the
        Telephone Consumer Protection Act where applicable, the Telemarketing Sales Rule,
        Do-Not-Call rules, call-recording consent laws, local calling-hour restrictions, and all
        industry-specific requirements. You must use accurate identification and contact
        information, include required disclosures, and honor opt-outs promptly.
      </p>

      <h2>3. Prohibited communications</h2>
      <p>You may not use the Services to:</p>
      <ul>
        <li>Send spam or contact recipients who have opted out or asked not to be contacted.</li>
        <li>Harass, threaten, abuse, discriminate against, or unlawfully surveil any person.</li>
        <li>Use deceptive identities, spoofing, false claims, impersonation, or misleading subject lines.</li>
        <li>Promote fraud, illegal goods or services, malware, phishing, or other harmful activity.</li>
        <li>Make claims that are false, unsubstantiated, defamatory, or infringe another party’s rights.</li>
        <li>Contact emergency lines, healthcare facilities, or other sensitive recipients in a disruptive manner.</li>
      </ul>

      <h2>4. Platform and security restrictions</h2>
      <p>
        You may not bypass limits or access controls; probe or disrupt systems; introduce malicious
        code; access another customer’s data; share credentials improperly; reverse engineer the
        Services; or use automated means to extract data except through authorized features.
      </p>

      <h2>5. AI and professional calling</h2>
      <p>
        You must review AI-generated content before use and may not direct the system or
        professional callers to make unlawful, discriminatory, deceptive, or unsupported claims.
        For AI+ calling, you are responsible for approved scripts, lawful contact instructions,
        suppression lists, and any required recording or monitoring disclosures.
      </p>

      <h2>6. Enforcement</h2>
      <p>
        We may investigate suspected violations and remove content, limit campaigns, suspend
        sending or calling, or terminate access. We may act immediately when activity threatens
        recipients, platform security, deliverability, our providers, or compliance obligations.
        Serious violations may be reported to appropriate authorities where required by law.
      </p>

      <h2>7. Reporting concerns</h2>
      <p>
        Report abuse or policy concerns to{" "}
        <a href="mailto:info@isdrxai.com">info@isdrxai.com</a>.
      </p>
    </LegalPage>
  );
}