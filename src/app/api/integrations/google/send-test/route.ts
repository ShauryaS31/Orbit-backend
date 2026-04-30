import { NextResponse } from "next/server";

import { sendGmailMessage } from "@/lib/services/gmail-integration";

interface SendTestBody {
  to?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SendTestBody;
  const to = body.to?.trim() || process.env.GOOGLE_TEST_RECIPIENT || process.env.GMAIL_TEST_TO;

  if (!to) {
    return NextResponse.json(
      { error: "Provide a 'to' email in the request body or set GOOGLE_TEST_RECIPIENT / GMAIL_TEST_TO." },
      { status: 400 },
    );
  }

  try {
    const result = await sendGmailMessage({
      to,
      subject: "Orbit Gmail integration test",
      text: [
        "This is a test email from Orbit.",
        "",
        "If you received this, the Gmail OAuth connection and messages.send flow are working.",
      ].join("\n"),
    });

    return NextResponse.json({
      status: "sent",
      provider: "gmail",
      messageId: result.id,
      threadId: result.threadId,
      to,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send Gmail test email." },
      { status: 500 },
    );
  }
}
