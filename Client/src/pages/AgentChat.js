import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import "../styles/AgentChat.css";

const EXAMPLE_PROMPTS = [
  "יש לי 10 עובדים, 3 עם אימון לנשק ו-7 בלי. יש לי 3 משמרות ביום: בוקר, צהריים, ערב. תבנה לי סידור לשבוע הבא.",
  "כמה עובדים לא שובצו בסידור האחרון ולמה?",
  "תראה לי את הגדרות המשמרות הנוכחיות שלי.",
];

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`chat-message ${isUser ? "chat-user" : "chat-agent"}`}>
      <div className="chat-bubble">
        <p className="chat-text">{msg.text}</p>
        {msg.actions && msg.actions.length > 0 && (
          <div className="chat-actions">
            {msg.actions.map((a, i) => (
              <span key={i} className="action-badge">
                ✓ {actionLabel(a.tool)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function actionLabel(tool) {
  const labels = {
    get_organization_config: "קרא הגדרות ארגון",
    get_employees: "קרא עובדים",
    update_organization_config: "עדכן הגדרות",
    run_scheduler: "הריץ סקדולר",
    get_schedule_result: "קרא תוצאות סידור",
  };
  return labels[tool] || tool;
}

export default function AgentChat() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [messages, setMessages] = useState([
    {
      role: "agent",
      text: `שלום ${user.name || ""}! אני הסוכן החכם של SafeShift.\n\nאני יכול לעזור לך:\n• להגדיר את מבנה המשמרות שלך\n• להריץ את אלגוריתם הסידור\n• להסביר מדוע משמרות לא שובצו\n\nתאר לי את הצוות שלך ואבנה סידור עבורך.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setLoading(true);

    try {
      const res = await axios.post("/api/agent/chat", {
        userId: user.id,
        orgId: user.organizationId || null,
        message: userText,
        conversationHistory,
      });

      if (res.data.success) {
        setConversationHistory(res.data.conversationHistory || []);
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            text: res.data.reply,
            actions: res.data.actions || [],
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "agent", text: `שגיאה: ${res.data.message}` },
        ]);
      }
    } catch (err) {
      const errMsg =
        err.response?.data?.message ||
        "אירעה שגיאה בשרת. בדוק שה-ANTHROPIC_API_KEY מוגדר ב-.env";
      setMessages((prev) => [...prev, { role: "agent", text: errMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="agent-page" dir="rtl">
      <div className="agent-header">
        <h2>סוכן SafeShift</h2>
        <p className="agent-subtitle">עוזר AI לבניית סידורי עבודה</p>
      </div>

      <div className="chat-window">
        {messages.map((msg, i) => (
          <Message key={i} msg={msg} />
        ))}
        {loading && (
          <div className="chat-message chat-agent">
            <div className="chat-bubble loading-bubble">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
        <div className="example-prompts">
          <p className="examples-label">דוגמאות לשאלות:</p>
          {EXAMPLE_PROMPTS.map((p, i) => (
            <button key={i} className="example-btn" onClick={() => sendMessage(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-row">
        <button
          className="send-btn"
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
        >
          שלח
        </button>
        <textarea
          className="chat-input"
          placeholder="תאר את הצוות שלך, שאל על הסידור..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={loading}
        />
      </div>
    </div>
  );
}
