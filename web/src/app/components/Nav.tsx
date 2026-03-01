"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../providers";
import { useState, useEffect } from "react";

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, session, loading, signOut } = useAuth();
  const [helperMode, setHelperMode] = useState(pathname === "/helper");
  useEffect(() => {
    setHelperMode(pathname === "/helper");
  }, [pathname]);

  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (loading) {
    return (
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="font-semibold text-stone-800">
            SellinSeconds
          </Link>
          <span className="text-sm text-stone-500">Loading…</span>
        </div>
      </header>
    );
  }

  if (!user && !isAuthPage) {
    return (
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="font-semibold text-stone-800">
            SellinSeconds
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-stone-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="shrink-0 font-semibold text-stone-800">
          SellinSeconds
        </Link>
        <div className="flex items-center gap-4">
          {!isAuthPage && (
            <>
              <Link
                href="/list"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
              >
                List an Item
              </Link>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-stone-600">Helper Mode</span>
                <input
                  type="checkbox"
                  checked={helperMode}
                  onChange={(e) => {
                    setHelperMode(e.target.checked);
                    if (e.target.checked) router.push("/helper");
                    else router.push("/");
                  }}
                  className="h-4 w-8 rounded-full accent-amber-600"
                />
              </label>
            </>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-stone-500">{user?.email}</span>
            <button
              type="button"
              onClick={() => signOut().then(() => router.push("/"))}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
