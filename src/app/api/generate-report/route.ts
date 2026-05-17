import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt, DISCLAIMER } from "@/lib/system-prompt";
import type { ReportRequest, ReportResponse } from "@/lib/schema";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const TEXT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "llama-3.2-90b-vision-preview";

export async function POST(req: NextRequest) {
  try {
    const body: ReportRequest = await req.json();

    if (!body.voice_input && (!body.body_map || body.body_map.length === 0)) {
      return NextResponse.json(
        { error: "At least one of voice_input or body_map must be provided." },
        { status: 400 }
      );
    }

    const hasImage = !!body.face_image_base64;

    const symptomPayload = JSON.stringify(
      {
        voice_input: body.voice_input || "",
        body_map: body.body_map || [],
        face_scan: body.face_scan || {
          facial_edema: false,
          periorbital_edema: false,
          pallor: false,
          facial_asymmetry: false,
          scan_available: false,
        },
        days_postpartum: body.days_postpartum ?? null,
        prior_conditions: body.prior_conditions ?? [],
      },
      null,
      2
    );

    const userContent: Groq.Chat.ChatCompletionContentPart[] = hasImage
      ? [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${body.face_image_base64}`,
            },
          },
          {
            type: "text",
            text: `Analyze the face photo above for visible clinical markers. Then process the following symptom data and return the full JSON report.\n\n${symptomPayload}`,
          },
        ]
      : [{ type: "text", text: symptomPayload }];

    const completion = await groq.chat.completions.create({
      model: hasImage ? VISION_MODEL : TEXT_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 4096,
    });

    const rawText = completion.choices[0]?.message?.content ?? "";

    let report: ReportResponse;
    try {
      report = JSON.parse(rawText);
    } catch {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      report = JSON.parse(cleaned);
    }

    report.disclaimer = DISCLAIMER;
    report.generated_at = new Date().toISOString();
    if (!Array.isArray(report.faceSymptoms)) report.faceSymptoms = [];

    return NextResponse.json(report);
  } catch (err) {
    console.error("generate-report error:", err);
    return NextResponse.json(
      { error: "Failed to generate report. Please try again." },
      { status: 500 }
    );
  }
}


