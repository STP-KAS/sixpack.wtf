function haystack(ev) {
  return [
    ev?.type,
    ev?.name,
    ev?.tool_name,
    ev?.item?.type,
    ev?.item?.name,
    ev?.output_item?.type,
    ev?.delta?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function firstQuery(ev) {
  const raw =
    ev?.action?.query ||
    ev?.item?.action?.query ||
    ev?.query ||
    ev?.item?.query ||
    ev?.delta?.query ||
    ev?.item?.arguments ||
    ev?.arguments ||
    ev?.delta?.arguments ||
    "";
  if (!raw) return "";
  if (typeof raw === "object") return String(raw.query || raw.q || "").trim();
  const s = String(raw).trim();
  if (!s) return "";
  if (s.startsWith("{")) {
    try {
      const j = JSON.parse(s);
      return String(j.query || j.q || "").trim();
    } catch {
      return "";
    }
  }
  return s;
}

export function describeStreamEvent(ev) {
  const hay = haystack(ev);
  const q = firstQuery(ev);
  if (/web_search/.test(hay)) {
    return {
      id: "web",
      text: q
        ? "Searching the web for “" + q.slice(0, 72) + "”. This is the slow part."
        : "Searching the web. This is the slow part.",
    };
  }
  if (/x_search/.test(hay)) {
    return { id: "x", text: "Checking named X handles. Catalog, not law. Also slow." };
  }
  if (/reasoning/.test(hay)) {
    return { id: "think", text: "Thinking it through. The sloths are not sprinters." };
  }
  if (ev?.type === "response.created" || ev?.type === "response.in_progress") {
    return { id: "up", text: "SpaceXAI is chewing the feed. Admit it: this takes a while." };
  }
  return null;
}

export function reasoningDelta(ev) {
  const choice = ev?.choices?.[0]?.delta?.reasoning_content;
  if (choice) return String(choice);
  if (ev?.type === "response.reasoning_text.delta" || ev?.type === "response.reasoning.delta") {
    if (typeof ev.delta === "string") return ev.delta;
    if (ev.delta?.text) return String(ev.delta.text);
    if (ev.delta?.reasoning_content) return String(ev.delta.reasoning_content);
  }
  return "";
}
