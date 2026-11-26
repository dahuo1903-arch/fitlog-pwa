import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// 已去除全局访问密码，直接进入个人隔离空间首页
export default function UnlockPage() {
  redirect("/");
}
