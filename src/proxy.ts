import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

/** Next 16 chama isto de "proxy" (antigo middleware). */
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tudo, exceto assets estaticos e imagens. O favicon e os arquivos do
     * /public nao precisam de sessao renovada a cada request.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
