export function helperText(features, status, statusLabel) {
  if (["clear", "deep"].includes(status)) {
    return `贵人线已标为${statusLabel}：阶段性支持信号较明确，常体现为老师、前辈、平台、客户和合作方，但仍以你先行动、先产出为前提。`;
  }
  if (status === "light") return "贵人线已标为偏浅：外部帮助有线索但不宜依赖，先把作品和履历做扎实。";
  if (status === "need_more") return "贵人线当前待补图：建议补掌心高清图，尤其看生命线内侧与上升支线。";
  if (features.includes("helperLines")) return "贵人线按生命线内侧辅助纹与上升支线看：属于阶段性贵人，常见于老师、前辈、平台、客户和合作方。你先把作品做出来，贵人才更容易落地。";
  return "贵人线尚未人工确认；现有未分类中心线不能据此命名或判断。";
}

export function sunText(features, status, statusLabel) {
  if (["clear", "deep"].includes(status)) return `太阳线已标为${statusLabel}：作品、口碑、曝光和社会认可可作为事业加分项，适合持续做可见成果。`;
  if (status === "light") return "太阳线已标为偏浅：名气和认可不是早爆型，适合靠长期作品、专业标签、口碑慢慢养。";
  if (status === "broken") return "太阳线已标为断续：曝光与认可有阶段波动，越要保持作品连续性，不宜频繁换方向。";
  if (status === "need_more") return "太阳线当前待补图：建议补无反光掌心图，重点看无名指下方太阳丘。";
  if (features.includes("sunLineLight")) return "太阳线偏浅时，名气和认可不是早爆型，适合靠长期作品、专业标签、口碑慢慢养。";
  return "太阳线尚未人工确认；不根据普通照片纹理推断认可或名气。";
}

export function moneyText(features, status, statusLabel) {
  if (["clear", "deep"].includes(status)) return `财运纹已标为${statusLabel}：偏技能财、项目财、信息财，适合把专业能力产品化和复利化。`;
  if (status === "light") return "财运纹已标为偏浅：副业和项目财先从小额、低风险、可复盘的方式试起。";
  if (status === "broken") return "财运纹已标为断续：收入节奏可能分阶段，重点是控制现金流和避免情绪化投机。";
  if (status === "need_more") return "财运纹当前待补图：建议补小指下水星丘区域，减少阴影和反光。";
  if (features.includes("moneyFineLines")) return "财运纹以小指下水星丘细竖纹为主：偏技能财、项目财、信息财。忌情绪化投机，宜长期复利。";
  return "财运纹尚未人工确认；不根据小指下普通纹理推断财运。";
}
