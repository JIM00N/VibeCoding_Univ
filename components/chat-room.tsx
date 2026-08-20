"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
import { CHAT_EVENT, chatTopic } from "@/lib/chat-channel";

export type ChatMessage = {
  id: number;
  body: string;
  createdAt: string;
  userId: number;
  nickname: string;
};

// 소켓이 붙어 있으면 폴링은 안전망 역할만 한다(놓친 이벤트·순단 대비). 못 붙으면 원래대로 3초.
const POLL_LIVE_MS = 20000;
const POLL_FALLBACK_MS = 3000;

// timeZone 을 못박아야 서버/클라이언트 렌더가 같아진다 (하이드레이션 불일치 방지)
const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ChatRoom({
  groupId,
  meId,
  initial,
}: {
  groupId: number;
  meId: number;
  initial: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/messages`, { cache: "no-store" });
      if (!res.ok) return; // 일시적 실패로 폴링을 멈추지 않는다
      const json = (await res.json()) as { messages: ChatMessage[] };
      setMessages(json.messages);
    } catch {
      /* 네트워크 순단은 무시 — 다음 주기에 다시 시도한다 */
    }
  }, [groupId]);

  // 소켓: Supabase Realtime 브로드캐스트. 신호만 받고 내용은 인증된 API 로 가져온다.
  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) return; // 공개 환경변수가 없으면 폴링만으로 동작

    const channel = sb
      .channel(chatTopic(groupId))
      .on("broadcast", { event: CHAT_EVENT }, () => {
        void load();
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      setLive(false);
      void sb.removeChannel(channel);
    };
  }, [groupId, load]);

  // 폴백 폴링 — 소켓이 붙었으면 간격을 늘려 안전망으로만 둔다
  useEffect(() => {
    const timer = setInterval(load, live ? POLL_LIVE_MS : POLL_FALLBACK_MS);
    return () => clearInterval(timer);
  }, [load, live]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);
    setText("");
    try {
      const res = await fetch(`/api/groups/${groupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "전송에 실패했어요.");
        setText(body); // 실패했으면 입력을 되돌려준다
      } else {
        await load();
      }
    } catch {
      setError("전송에 실패했어요. 잠시 후 다시 시도해주세요.");
      setText(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-17rem)] sm:h-[calc(100dvh-13rem)] min-h-80">
      <div className="flex-1 overflow-y-auto rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">
            아직 대화가 없어요. 첫 메시지를 남겨보세요.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.userId === meId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && <span className="text-[12px] text-slate-400 mb-0.5 px-1">{m.nickname}</span>}
                <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                  <p
                    className={`max-w-[75%] px-3 py-2 rounded-2xl text-[14px] leading-snug whitespace-pre-wrap break-words ${
                      mine ? "bg-blue-600 text-white rounded-br-sm" : "bg-slate-100 text-slate-800 rounded-bl-sm"
                    }`}
                  >
                    {m.body}
                  </p>
                  <span className="text-[11px] text-slate-300 shrink-0">
                    {timeFmt.format(new Date(m.createdAt))}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-2.5 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지를 입력해주세요"
          maxLength={500}
          className="flex-1 min-w-0 h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400"
        />
        <button
          disabled={sending || text.trim().length === 0}
          className="h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          보내기
        </button>
      </form>
      {error && <p className="mt-1.5 text-[13px] text-red-600">{error}</p>}
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-300">
        <span
          aria-hidden
          className={`inline-block w-1.5 h-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`}
        />
        {live ? "실시간으로 연결됐어요." : "연결 중 — 새 메시지는 몇 초 안에 보여요."}
      </p>
    </div>
  );
}
