// 서버·클라이언트가 함께 쓰는 채널 상수. 시크릿을 참조하지 않으므로 양쪽에서 안전하게 임포트된다.

export const CHAT_EVENT = "new-message";

export function chatTopic(groupId: number): string {
  return `gyemoim-group-${groupId}`;
}
