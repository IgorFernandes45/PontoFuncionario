import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin), {
    status: 303,
  });
  response.cookies.delete(ACTIVE_COMPANY_COOKIE);
  return response;
}
