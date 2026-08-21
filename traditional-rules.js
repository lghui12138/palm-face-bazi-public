import { helperText, sunText, moneyText } from "./traditional-line-texts.js?v=20260724.1";

const palm = {
  thickPalm: {
    title: "掌肉厚实",
    sources: ["诺愚：掌肉与承载", "陈泰先：骨肉与现实欲", "瑞德：掌丘饱满"],
    sourceRefs: ["local.reid#hand-shapes", "local.nuoyu#hand-shapes"],
    text: "重现实安全感，适合把技能、项目和资源沉淀成稳定成果。"
  },
  warmPalm: {
    title: "掌色偏红润",
    sources: ["陈泰先：相气色", "诺愚：掌色", "瑞德：健康观察"],
    sourceRefs: ["local.chentai#palm-contents", "web.palmar-anatomy#normal-variation"],
    text: "精力底子不差，但压力大时容易急、燥、睡眠受影响。"
  },
  busyTexture: {
    title: "细碎纹偏多",
    sources: ["瑞德：辅助线与干扰纹", "诺愚：杂线", "陈泰先：忧思纹"],
    sourceRefs: ["local.reid#auxiliary-lines", "local.nuoyu#flow-chart"],
    text: "脑内推演多，容易操心。优势是敏感细致，风险是内耗。"
  },
  clearMainLines: {
    title: "主线较清楚",
    sources: ["瑞德：生命/智慧/感情线", "诺愚：三大线", "陈泰先：三线总论"],
    sourceRefs: ["local.reid#major-line-map", "local.nuoyu#flow-chart", "local.chentai#palm-contents"],
    text: "人生主轴不散，适合用长期计划代替短期情绪决策。"
  },
  longHeadLine: {
    title: "智慧线长且下斜",
    sources: ["瑞德：头脑线心理", "陈泰先：理智线", "诺愚：理智线流年"],
    sourceRefs: ["local.nuoyu#head-line", "local.chentai#head-line"],
    text: "直觉、联想和研究能力强，适合技术、研究、策划、内容与命理分析类工作。"
  },
  steadyLifeLine: {
    title: "生命线弧度大",
    sources: ["瑞德：生命线不等于寿命", "陈泰先：生命线", "诺愚：生命线形态"],
    sourceRefs: ["local.nuoyu#life-line", "local.chentai#life-line", "web.palmistry-boundary#validity"],
    text: "恢复力与生活欲较足。只能看精力倾向，不能断具体寿命。"
  },
  fateLineStage: {
    title: "命运线有阶段感",
    sources: ["瑞德：命运线与事业", "陈泰先：事业线", "诺愚：玉柱纹"],
    sourceRefs: ["local.reid#fate-line", "local.chentai#success-line"],
    text: "事业不是一路直线，25到36岁更像边试边定，后劲强于早发。"
  },
  sunLineLight: {
    title: "太阳线偏浅",
    sources: ["瑞德：太阳线", "陈泰先：成功线", "诺愚：太阳丘"],
    sourceRefs: ["local.reid#sun-line", "local.nuoyu#success-line", "local.chentai#success-line"],
    text: "认可和名气靠作品与专业标签慢慢养，不宜频繁换方向。"
  },
  helperLines: {
    title: "生命线内侧有辅助纹",
    sources: ["瑞德：辅助线", "诺愚：贵人辅助", "陈泰先：火星线"],
    sourceRefs: ["local.reid#auxiliary-lines", "local.nuoyu#flow-chart"],
    text: "有阶段性贵人，但往往在你先行动、先产出后出现。"
  },
  moneyFineLines: {
    title: "小指下有细财纹",
    sources: ["陈泰先：财运纹", "诺愚：水星丘", "瑞德：水星区"],
    sourceRefs: ["local.chentai#wealth-chapter", "local.reid#auxiliary-lines"],
    text: "更偏技能财、项目财、信息财，不是纯靠横财。"
  }
};

const face = {
  fullForehead: {
    title: "额头开阔",
    sources: ["三庭：上庭", "文化读本：相术背景"],
    sourceRefs: ["local.chentai#face-overview", "local.culture#history", "web.face-anthropometry#thirds"],
    text: "早年学习、规划、视野意识较强，适合靠知识结构起步。"
  },
  stableBrowEyes: {
    title: "眉眼稳定",
    sources: ["陈泰先：眉眼神", "形神法"],
    sourceRefs: ["local.chentai#face-overview", "web.face-validity#validity"],
    text: "执行和观察力较稳，人际判断不宜急，越稳定越聚势。"
  },
  brightEyes: {
    title: "眼神有光",
    sources: ["陈泰先：神", "面相总论"],
    sourceRefs: ["local.chentai#face-overview", "web.face-validity#validity"],
    text: "当前行动意愿较强，适合把想法落实为可见作品。"
  },
  balancedNose: {
    title: "鼻部端正有肉",
    sources: ["陈泰先：财帛宫", "五官法"],
    sourceRefs: ["local.chentai#nose", "web.face-anthropometry#thirds"],
    text: "资源控制和财务意识较强，适合稳健积累。"
  },
  clearMouth: {
    title: "口形清楚",
    sources: ["陈泰先：口相", "五官法"],
    sourceRefs: ["local.chentai#mouth", "web.face-anthropometry#thirds"],
    text: "表达、承诺和合作边界重要，话说清楚比硬扛更有利。"
  },
  firmJaw: {
    title: "下巴承托感强",
    sources: ["三庭：下庭", "陈泰先：晚运"],
    sourceRefs: ["local.chentai#chin", "web.face-anthropometry#thirds", "web.face-reference-data#landmarks"],
    text: "晚段稳定性较好，越到后面越重资产、家庭和长期结构。"
  },
  warmComplexion: {
    title: "气色偏暖",
    sources: ["陈泰先：相气色", "文化读本：气色观"],
    sourceRefs: ["local.chentai#face-overview", "web.face-ai-caveats#confounders"],
    text: "阶段状态较有动能，但仍需避免熬夜上火。"
  },
  tiredComplexion: {
    title: "疲态偏重",
    sources: ["陈泰先：气色", "健康提示"],
    sourceRefs: ["local.chentai#face-overview", "web.face-ai-caveats#confounders"],
    text: "近期压力或作息可能拖累状态。仅作生活提醒，不作疾病判断。"
  }
};

const palmSpecs = [
  { key: "life_line", label: "生命线", meaning: "精力恢复、生活节奏与承载力；不用于判断寿命长短。" },
  { key: "head_line", label: "智慧线", meaning: "思维方式、判断习惯、学习研究与决策路径。" },
  { key: "heart_line", label: "感情线", meaning: "情绪表达、亲密关系节奏与人际敏感度。" },
  { key: "fate_line", label: "命运线", meaning: "事业阶段、平台变化与责任上升节点。" },
  { key: "sun_line", label: "太阳线", meaning: "作品曝光、口碑、名声与被认可的方式。" },
  { key: "wealth_lines", label: "财运纹", meaning: "技能财、项目财、信息财与副业变现线索。" },
  { key: "helper_lines", label: "贵人线", meaning: "外部支持、前辈平台、合作资源与阶段性助力。" },
  { key: "marriage_lines", label: "婚姻线", meaning: "亲密关系倾向；需小指侧边清晰图配合判断。" }
];

const faceSpecs = [
  { key: "three_courts", label: "三庭比例", meaning: "早中晚段节奏、规划感与长期稳定性。" },
  { key: "face_shape", label: "脸型轮廓", meaning: "整体气质、行动方式与承载结构。" },
  { key: "forehead_zone", label: "额头上庭", meaning: "学习规划、视野、早年资源与起步方式。" },
  { key: "brow_eye_zone", label: "眉眼神采", meaning: "观察力、执行意愿、人际判断与阶段状态。" },
  { key: "nose_zone", label: "鼻部财帛", meaning: "资源整合、财务意识与现实掌控力。" },
  { key: "mouth_jaw_zone", label: "口相下巴", meaning: "表达承诺、合作边界、晚段稳定与承托。" },
  { key: "profile_zone", label: "侧面骨相", meaning: "立体度、骨肉比例与长期抗压结构。" },
  { key: "complexion_zone", label: "阶段气色", meaning: "近期精神状态与生活管理提示；不作疾病诊断。" }
];

const boundedScore = (value) => Math.max(0, Math.min(96, value));

function palmScores(features, weights = {}) {
  const has = (key) => features.includes(key);
  const weight = (key) => Number(weights[key] || 0);
  return {
    career: boundedScore(56 + (has("longHeadLine") ? 11 : 0) + (has("fateLineStage") ? 13 : 0) + (has("sunLineLight") ? -2 : 3) + weight("fate_line") + Math.round(weight("head_line") * 0.6)),
    wealth: boundedScore(52 + (has("moneyFineLines") ? 12 : 0) + (has("thickPalm") ? 8 : 0) + (has("fateLineStage") ? 8 : 0) + weight("wealth_lines") + Math.round(weight("sun_line") * 0.5)),
    love: boundedScore(55 + (has("busyTexture") ? -4 : 3) + (has("steadyLifeLine") ? 6 : 0) + weight("heart_line") + Math.round(weight("marriage_lines") * 0.5)),
    vitality: boundedScore(58 + (has("steadyLifeLine") ? 12 : 0) + (has("warmPalm") ? 5 : 0) + (has("busyTexture") ? -5 : 0) + weight("life_line"))
  };
}

function faceScores(features, weights = {}) {
  const has = (key) => features.includes(key);
  const weight = (key) => Number(weights[key] || 0);
  return {
    plan: boundedScore(54 + (has("fullForehead") ? 15 : 0) + (has("brightEyes") ? 5 : 0) + weight("three_courts") + weight("forehead_zone")),
    action: boundedScore(52 + (has("stableBrowEyes") ? 12 : 0) + (has("brightEyes") ? 10 : 0) + weight("brow_eye_zone") + Math.round(weight("complexion_zone") * 0.5)),
    resource: boundedScore(50 + (has("balancedNose") ? 16 : 0) + (has("clearMouth") ? 6 : 0) + weight("nose_zone") + Math.round(weight("mouth_jaw_zone") * 0.5)),
    stability: boundedScore(52 + (has("firmJaw") ? 15 : 0) + (has("tiredComplexion") ? -8 : 0) + weight("mouth_jaw_zone") + Math.round(weight("profile_zone") * 0.6))
  };
}

function faceAdvice(features) {
  const parts = [];
  if (features.includes("tiredComplexion")) parts.push("近期先把睡眠、运动和压力降下来，否则面相里的气色会拖累判断。");
  if (features.includes("balancedNose")) parts.push("资源和财务意识可用，适合建立预算、项目账本和长期资产计划。");
  if (features.includes("clearMouth")) parts.push("合作时把边界写清楚，口头承诺少一点，书面规则多一点。");
  return parts.length ? parts.join("") : "先补正脸清晰照片，再把额、眉眼、鼻、口、下巴分区确认。";
}

function evidenceSnapshot(mode, features = [], annotations = [], personal = false) {
  const allowed = ["manual", "manual_semantic_review", "model_adapter"];
  const reviewed = annotations.filter((item) => item && item.active && allowed.includes(item.source));
  const authorized = Boolean(personal || features.length || reviewed.length);
  return {
    version: "traditional-evidence-v1",
    mode,
    authorized,
    authorization: personal ? "personal_master" : features.length ? "manual_features" : reviewed.length ? "reviewed_annotations" : "none",
    featureKeys: [...features],
    annotationKeys: reviewed.map((item) => item.key),
    scoreStatus: authorized ? "generated" : "withheld",
    timelineStatus: mode === "palm" ? authorized ? "generated" : "withheld" : "not_applicable",
    learningEligible: authorized,
    boundaries: ["photo_metrics_are_not_traditional_semantics", "unreviewed_semantics_do_not_generate_scores"]
  };
}

export default Object.freeze({
  palm: Object.freeze(palm),
  face: Object.freeze(face),
  palmSpecs: Object.freeze(palmSpecs),
  faceSpecs: Object.freeze(faceSpecs),
  palmScores,
  faceScores,
  faceAdvice,
  helperText,
  sunText,
  moneyText,
  evidenceSnapshot
});
