"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../providers";
import { LoadingSpinner } from "./LoadingSpinner";
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { getStoredHelperMode, setStoredHelperMode } from "@/lib/helper-mode";
const isChatDetailPath = (path: string) => path.startsWith("/chat/") && path !== "/chat" && path.length > 6;

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, session, loading, signOut } = useAuth();
  const [helperMode, setHelperMode] = useState(pathname === "/helper");
  const [unreadChats, setUnreadChats] = useState(0);
  const lastOptimisticPath = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const stored = getStoredHelperMode(user.id);
    if (pathname === "/helper") {
      setHelperMode(true);
      setStoredHelperMode(user.id, true);
    } else {
      setHelperMode(stored);
    }
  }, [user?.id, pathname]);

  const handleHelperModeChange = (on: boolean) => {
    setHelperMode(on);
    setStoredHelperMode(user?.id, on);
    if (on) router.push("/helper");
    else router.push("/");
  };

  const isOnChatSection = pathname === "/chat" || pathname.startsWith("/chat/");

  useEffect(() => {
    if (!session?.access_token) {
      setUnreadChats(0);
      lastOptimisticPath.current = null;
      return;
    }
    if (!isOnChatSection) {
      setUnreadChats(0);
      lastOptimisticPath.current = null;
      return;
    }
    if (isChatDetailPath(pathname) && lastOptimisticPath.current !== pathname) {
      lastOptimisticPath.current = pathname;
      setUnreadChats((prev) => Math.max(0, prev - 1));
    }
    apiFetch("/chat", { token: session.access_token })
      .then((r) => r.json())
      .then((d) => {
        const chatsWithUnread = (d.chats ?? []).filter((c: { unread_count?: number }) => (c.unread_count ?? 0) > 0).length;
        setUnreadChats(chatsWithUnread);
      })
      .catch(() => setUnreadChats(0));
  }, [session?.access_token, pathname, isOnChatSection]);

  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (loading) {
    return (
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="font-semibold text-stone-800">
            SellinSeconds
          </Link>
          <LoadingSpinner fullPage={false} label={false} className="py-0" />
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
        <Link
          href={helperMode ? "/helper" : "/"}
          className="shrink-0 font-semibold text-stone-800"
        >
          SellinSeconds
        </Link>
        <div className="flex items-center gap-4">
          {!isAuthPage && (
            <>
              <Link
                href="/chat"
                className="relative rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
              >
                Chat
                {unreadChats > 0 && (
                  <span className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-white">
                    {unreadChats > 99 ? "99+" : unreadChats}
                  </span>
                )}
              </Link>
              {!helperMode && (
                <>
                  <Link
                    href="/list"
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
                  >
                    List an Item
                  </Link>
                  <Link
                    href="/seller/listings"
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100"
                  >
                    My listings
                  </Link>
                </>
              )}
              <label className="flex items-center gap-2 text-sm">
                <span className="text-stone-600">Helper Mode</span>
                <input
                  type="checkbox"
                  checked={helperMode}
                  onChange={(e) => handleHelperModeChange(e.target.checked)}
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
