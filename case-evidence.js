(() => {
  function mode(item) {
    return item && (item.mode || item.payload && item.payload.type) || "";
  }

  function eligible(item, personal = false) {
    if (!item) return false;
    if (personal || mode(item) === "bazi") return true;
    const payload = item.payload;
    if (!payload) return false;
    if (payload.traditionalEvidence) {
      return payload.traditionalEvidence.authorized === true && payload.traditionalEvidence.learningEligible !== false;
    }
    return [...(payload.lineAnnotations || []), ...(payload.zoneAnnotations || [])].some((entry) =>
      entry && entry.status !== "unknown" && ["manual", "manual_semantic_review", "model_adapter"].includes(entry.source)
    );
  }

  function matches(item, filter, personal = false) {
    if (filter === "all") return true;
    if (filter === "personal") return personal;
    if (personal) return false;
    const accepted = eligible(item);
    return filter === "traditional" ? accepted : filter === "observation" ? !accepted && ["palm", "face"].includes(mode(item)) : true;
  }

  globalThis.caseEvidenceRuntime = Object.freeze({ eligible, matches });
})();
