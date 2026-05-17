import { NextResponse } from "next/server";

import { renderJob } from "@/lib/ffmpeg";

export const runtime = "nodejs";

type RenderJobRouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(_request: Request, context: RenderJobRouteContext) {
  const { jobId } = await context.params;

  try {
    const renderedJob = await renderJob(jobId);

    return NextResponse.json({
      job: renderedJob,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Render failed.",
      },
      { status: 400 },
    );
  }
}
