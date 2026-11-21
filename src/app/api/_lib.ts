import { NextResponse } from "next/server";

export function ok<T extends object>(body: T, status = 200) {
  return NextResponse.json({ ok: true, ...body }, { status });
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export const AI_DOWN_MESSAGE =
  "Our AI is taking longer than usual. Your inputs are saved — please try again in a moment.";
