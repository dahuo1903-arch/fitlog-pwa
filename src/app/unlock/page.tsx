import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  isAccessPinEnabled,
  verifySessionToken,
} from "@/lib/auth";
import { UnlockForm } from "@/components/UnlockForm";

export const dynamic = "force-dynamic";

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isAccessPinEnabled()) {
    redirect("/");
  }

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (session) {
    redirect("/");
  }

  const query = await searchParams;
  const nextPath =
    typeof query.next === "string" &&
    query.next.startsWith("/") &&
    !query.next.startsWith("//")
      ? query.next
      : "/";

  return (
    <main className="safe-pt safe-pb mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-5">
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-6 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/apple-touch-icon.png"
            alt="FitLog"
            className="mb-3 h-14 w-14 rounded-2xl border border-zinc-800"
          />
          <h1 className="text-lg font-semibold tracking-tight text-zinc-50">
            FitLog
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            个人健身与饮食记录 · 请输入访问密码
          </p>
        </div>

        <UnlockForm nextPath={nextPath} />
      </div>
    </main>
  );
}
