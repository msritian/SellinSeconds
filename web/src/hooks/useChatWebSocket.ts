"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getChatWebSocketUrl } from "@/lib/api";

export type Message = { id: string; sender_id: string; content: string; sent_at: string };

export type FinalizeUpdateState = {
  buyer_confirmed: boolean;
  seller_confirmed: boolean;
  hold_triggered: boolean;
  status: string;
};

type UseChatWebSocketOptions = {
  chatId: string | null;
  token: string | null;
  onMessage: (message: Message) => void;
  onError?: (message: string) => void;
  onFinalizeUpdate?: (state: FinalizeUpdateState) => void;
};

export function useChatWebSocket({
  chatId,
  token,
  onMessage,
  onError,
  onFinalizeUpdate,
}: UseChatWebSocketOptions): {
  connected: boolean;
  sendMessage: (content: string) => void;
  sendFinalizeUpdate: (state: FinalizeUpdateState) => void;
} {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onFinalizeUpdateRef = useRef(onFinalizeUpdate);
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;
  onFinalizeUpdateRef.current = onFinalizeUpdate;

  const connect = useCallback(() => {
    if (!chatId || !token || typeof window === "undefined") return;
    const url = getChatWebSocketUrl(chatId, token);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect after 2s (e.g. network blip, server restart)
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connect();
      }, 2000);
    };

    ws.onerror = () => {
      onErrorRef.current?.("Connection error");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === "message" && data.id && data.sender_id != null && data.content != null && data.sent_at) {
          onMessageRef.current({
            id: data.id,
            sender_id: data.sender_id,
            content: data.content,
            sent_at: data.sent_at,
          });
        } else if (data.type === "finalize_update" && typeof data.buyer_confirmed === "boolean" && typeof data.seller_confirmed === "boolean" && typeof data.hold_triggered === "boolean") {
          onFinalizeUpdateRef.current?.({
            buyer_confirmed: data.buyer_confirmed,
            seller_confirmed: data.seller_confirmed,
            hold_triggered: data.hold_triggered,
            status: data.status ?? (data.buyer_confirmed && data.seller_confirmed ? "both_confirmed" : "pending"),
          });
        } else if (data.type === "error") {
          onErrorRef.current?.(data.message ?? "Error");
        }
      } catch {
        // ignore non-JSON
      }
    };
  }, [chatId, token]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [connect]);

  const sendMessage = useCallback((content: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "message", content: content.trim() }));
    }
  }, []);

  const sendFinalizeUpdate = useCallback((state: FinalizeUpdateState) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "finalize_update",
          buyer_confirmed: state.buyer_confirmed,
          seller_confirmed: state.seller_confirmed,
          hold_triggered: state.hold_triggered,
          status: state.status,
        })
      );
    }
  }, []);

  return { connected, sendMessage, sendFinalizeUpdate };
}
