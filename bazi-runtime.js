(function (global) {
  "use strict";

  const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const cycle = Array.from({ length: 60 }, (_, index) => stems[index % 10] + branches[index % 12]);
  const branchHiddenStems = {
    子: [{ stem: "癸", share: 1, rank: "主气" }],
    丑: [{ stem: "己", share: 0.6, rank: "主气" }, { stem: "癸", share: 0.3, rank: "中气" }, { stem: "辛", share: 0.1, rank: "余气" }],
    寅: [{ stem: "甲", share: 0.6, rank: "主气" }, { stem: "丙", share: 0.3, rank: "中气" }, { stem: "戊", share: 0.1, rank: "余气" }],
    卯: [{ stem: "乙", share: 1, rank: "主气" }],
    辰: [{ stem: "戊", share: 0.6, rank: "主气" }, { stem: "乙", share: 0.3, rank: "中气" }, { stem: "癸", share: 0.1, rank: "余气" }],
    巳: [{ stem: "丙", share: 0.6, rank: "主气" }, { stem: "戊", share: 0.3, rank: "中气" }, { stem: "庚", share: 0.1, rank: "余气" }],
    午: [{ stem: "丁", share: 0.7, rank: "主气" }, { stem: "己", share: 0.3, rank: "中气" }],
    未: [{ stem: "己", share: 0.6, rank: "主气" }, { stem: "丁", share: 0.3, rank: "中气" }, { stem: "乙", share: 0.1, rank: "余气" }],
    申: [{ stem: "庚", share: 0.6, rank: "主气" }, { stem: "壬", share: 0.3, rank: "中气" }, { stem: "戊", share: 0.1, rank: "余气" }],
    酉: [{ stem: "辛", share: 1, rank: "主气" }],
    戌: [{ stem: "戊", share: 0.6, rank: "主气" }, { stem: "辛", share: 0.3, rank: "中气" }, { stem: "丁", share: 0.1, rank: "余气" }],
    亥: [{ stem: "壬", share: 0.7, rank: "主气" }, { stem: "甲", share: 0.3, rank: "中气" }]
  };
  const pillarAxes = {
    year: "外部圈层、长辈家族、旧平台与公开身份",
    month: "主业平台、上级规则、客户财源与工作节奏",
    day: "亲密关系、合作、居住安排与身体节奏",
    hour: "项目收尾、副业、下属子女与长期安排",
    luck: "十年主线"
  };
  const youthPillarAxes = {
    year: "家庭、长辈与外部成长环境",
    month: "学校、班级、教师规则与学习节奏",
    day: "本人状态、同伴相处与日常节奏",
    hour: "兴趣、作品、长期学习安排与家庭期待",
    luck: "这一阶段的成长主线"
  };
  const requiredHostFunctions = [
    "annualStageProfile",
    "strongestAnnualDomain",
    "weakestAnnualDomain",
    "annualTrend",
    "annualDomainLabel",
    "palmDomainAdvice",
    "palmAnnualActions",
    "createLazyTimelineProvider"
  ];
  let host = null;

  function configure(nextHost) {
    const missing = requiredHostFunctions.filter((key) => !nextHost || typeof nextHost[key] !== "function");
    if (missing.length) throw new Error(`bazi_runtime_host_missing:${missing.join(",")}`);
    host = nextHost;
    return api;
  }

  function dependencies() {
    if (!host) throw new Error("bazi_runtime_not_configured");
    return host;
  }

  function estimatePillars(date, dayPillar) {
    if (global.Solar && typeof global.Solar.fromYmdHms === "function") {
      const lunar = global.Solar.fromYmdHms(
        date.getFullYear(), date.getMonth() + 1, date.getDate(),
        date.getHours(), date.getMinutes(), date.getSeconds()
      ).getLunar();
      const eightChar = lunar.getEightChar();
      return {
        year: eightChar.getYear(),
        month: eightChar.getMonth(),
        day: eightChar.getDay(),
        hour: eightChar.getTime(),
        exact: true,
        calculation: "lunar-javascript-1.7.7"
      };
    }
    const solarYear = isBeforeApproxLichun(date) ? date.getFullYear() - 1 : date.getFullYear();
    const yearIndex = mod(solarYear - 4, 60);
    const yearPillar = cycle[yearIndex];
    const solarMonth = estimateSolarMonth(date);
    const monthStemStart = monthStemStartIndex(stems.indexOf(yearPillar[0]));
    const monthStem = stems[(monthStemStart + solarMonth.index) % 10];
    const monthPillar = monthStem + solarMonth.branch;
    const hourBranch = hourBranchFromHour(date.getHours());
    return {
      year: yearPillar,
      month: monthPillar,
      day: dayPillar || "待复核",
      hour: hourBranch,
      exact: false,
      calculation: "local-solar-term-approximation"
    };
  }

  function buildChartContext(date, gender = "male", personalBundle = null) {
    const context = {
      calculation: global.Solar ? "lunar-javascript-1.7.7" : "local-solar-term-approximation",
      gender,
      luckStart: null,
      luckCycles: [],
      personalEvidence: summarizePersonalEvidence(personalBundle)
    };
    if (!global.Solar || typeof global.Solar.fromYmdHms !== "function") return context;
    const lunar = global.Solar.fromYmdHms(
      date.getFullYear(), date.getMonth() + 1, date.getDate(),
      date.getHours(), date.getMinutes(), date.getSeconds()
    ).getLunar();
    const yun = lunar.getEightChar().getYun(gender === "male" ? 1 : 0);
    const startSolar = yun.getStartSolar();
    context.luckStart = {
      year: yun.getStartYear(),
      month: yun.getStartMonth(),
      day: yun.getStartDay(),
      solar: startSolar ? startSolar.toString() : ""
    };
    context.luckCycles = yun.getDaYun(12).map((item) => ({
      index: item.getIndex(),
      startYear: item.getStartYear(),
      endYear: item.getEndYear(),
      startAge: item.getStartAge(),
      endAge: item.getEndAge(),
      ganZhi: item.getGanZhi()
    }));
    return context;
  }

  function summarizePersonalEvidence(bundle) {
    const data = bundle && bundle.data;
    const seed = bundle && bundle.seed;
    if (!data || !Array.isArray(data.palmSamples) || !Array.isArray(data.faceSamples)) return null;
    const palmSamples = data.palmSamples;
    const faceSamples = data.faceSamples;
    const palmKeypoints = palmSamples.reduce((sum, sample) => sum + arrayLength(sample && sample.modelResult && sample.modelResult.keypoints), 0);
    const palmSides = palmSamples.map((sample) => sample && sample.modelResult && sample.modelResult.handOrientation && sample.modelResult.handOrientation.side).filter(Boolean);
    const faceKeypoints = faceSamples.reduce((sum, sample) => sum + arrayLength(sample && sample.modelResult && sample.modelResult.keypoints), 0);
    const supports = faceSamples.map((sample) => Number(sample && sample.modelResult && sample.modelResult.faceProportions && sample.modelResult.faceProportions.chinSupport && sample.modelResult.faceProportions.chinSupport.chinSupportRatio)).filter((value) => value > 0);
    const lipBands = faceSamples.map((sample) => Number(sample && sample.modelResult && sample.modelResult.faceProportions && sample.modelResult.faceProportions.chinSupport && sample.modelResult.faceProportions.chinSupport.lipBandRatio)).filter((value) => value > 0);
    return {
      profileId: data.profileId || "personal-master",
      palm: {
        sampleCount: palmSamples.length,
        keypointCount: palmKeypoints,
        sides: palmSides,
        handedness: seed && seed.selfReport && seed.selfReport.handednessLabel || "右手为主，左右使用整体较均衡",
        semanticStatus: "geometry_review_pending"
      },
      face: {
        sampleCount: faceSamples.length,
        keypointCount: faceKeypoints,
        chinSupportRatios: supports,
        lipBandRatios: lipBands,
        manualReview: seed && seed.manualReview && seed.manualReview.face || null,
        semanticStatus: "visual_structure_only"
      }
    };
  }

  function arrayLength(value) {
    return Array.isArray(value) ? value.length : 0;
  }

  function isBeforeApproxLichun(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    if (month < 2) return true;
    if (month > 2) return false;
    return day < 4;
  }

  function estimateSolarMonth(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const boundaries = [
      { m: 2, d: 4, branch: "寅" },
      { m: 3, d: 6, branch: "卯" },
      { m: 4, d: 5, branch: "辰" },
      { m: 5, d: 6, branch: "巳" },
      { m: 6, d: 6, branch: "午" },
      { m: 7, d: 7, branch: "未" },
      { m: 8, d: 8, branch: "申" },
      { m: 9, d: 8, branch: "酉" },
      { m: 10, d: 8, branch: "戌" },
      { m: 11, d: 7, branch: "亥" },
      { m: 12, d: 7, branch: "子" },
      { m: 1, d: 6, branch: "丑" }
    ];
    const numeric = month * 100 + day;
    const ordered = boundaries
      .map((item, index) => ({ ...item, index, value: item.m * 100 + item.d }))
      .sort((a, b) => a.value - b.value);
    let current = ordered[0];
    for (const item of ordered) {
      if (numeric >= item.value) current = item;
    }
    if (numeric < 106) current = ordered[ordered.length - 1];
    const branchIndex = branches.indexOf(current.branch);
    const monthIndexFromYin = mod(branchIndex - branches.indexOf("寅"), 12);
    return { branch: current.branch, index: monthIndexFromYin };
  }

  function monthStemStartIndex(yearStemIndex) {
    if (yearStemIndex === 0 || yearStemIndex === 5) return 2;
    if (yearStemIndex === 1 || yearStemIndex === 6) return 4;
    if (yearStemIndex === 2 || yearStemIndex === 7) return 6;
    if (yearStemIndex === 3 || yearStemIndex === 8) return 8;
    return 0;
  }

  function hourBranchFromHour(hour) {
    const index = Math.floor(((hour + 1) % 24) / 2);
    return branches[index] + "时";
  }

  function mod(value, base) {
    return ((value % base) + base) % base;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function elementText(pillars) {
    const chart = natalChartProfile(pillars);
    if (chart.personal) {
      return `本盘按月令、通根和透干综合看为${chart.strength}。${chart.monthCommand}；原局天干金集中，日坐申根，辰土承接，不能用表层五行个数代替旺衰。取用次序以火、木、水为先：火承规则与责任，木承财与现实资源，水承输出与疏泄；金土再叠时要防同类过重、准备过多和硬扛。`;
    }
    const text = `${pillars.year}${pillars.month}${pillars.day}${pillars.hour}`;
    const count = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    for (const char of text) {
      const element = elementOf(char);
      if (element) count[element] += 1;
    }
    const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
    const strong = sorted[0][0];
    const weak = sorted[sorted.length - 1][0];
    const calculation = pillars.exact ? "精确四柱的天干地支表层计数" : "本地近似盘";
    return `${calculation}里，${strong}气较显，${weak}气较弱；这里没有把藏干、月令旺衰和流派权重伪装成统一答案。建议用事业、财务、感情、健康四条线交叉看，不用单一五行直接定命。`;
  }

  function elementOf(char) {
    if ("甲乙寅卯".includes(char)) return "木";
    if ("丙丁巳午".includes(char)) return "火";
    if ("戊己辰戌丑未".includes(char)) return "土";
    if ("庚辛申酉".includes(char)) return "金";
    if ("壬癸亥子".includes(char)) return "水";
    return "";
  }

  function baziTimeline(birthYear, pillars, range = { startYear: birthYear, endYear: birthYear + 100 }, context = {}) {
    const years = [];
    for (let year = range.startYear; year <= range.endYear; year += 1) {
      years.push(baziTimelineYear(birthYear, pillars, year, context));
    }
    return years;
  }

  function baziTimelineYear(birthYear, pillars, year, context = {}) {
    const deps = dependencies();
    const age = year - birthYear;
    const yearPillar = cycle[mod(year - 4, 60)];
    const stem = yearPillar[0];
    const branch = yearPillar[1];
    const stemElement = elementOf(stem);
    const branchElement = elementOf(branch);
    const stage = deps.annualStageProfile(age);
    const relations = baziBranchRelations(branch, pillars);
    const luck = luckCycleForYear(context, year);
    const stemRelations = baziStemRelations(stem, pillars);
    const luckRelations = baziLuckRelations(yearPillar, luck, year);
    const chart = natalChartProfile(pillars);
    chart.gender = context.gender || (chart.personal ? "male" : "");
    const dayStem = isValidDayPillar(pillars.day) ? pillars.day[0] : "";
    const tenGod = tenGodFor(dayStem, stem);
    const annualStructure = elementInteraction(stemElement, branchElement);
    const evidence = annualEvidenceProfile({
      year, age, yearPillar, stem, branch, dayStem, tenGod, relations, stemRelations, luckRelations, luck
    }, pillars);
    const branchGod = evidence.annualHidden[0] ? evidence.annualHidden[0].tenGod : "";
    const domainScores = {
      career: baziAnnualDomainScore("career", year, relations, stage, luck, tenGod, branchGod, luckRelations, evidence),
      wealth: baziAnnualDomainScore("wealth", year, relations, stage, luck, tenGod, branchGod, luckRelations, evidence),
      love: baziAnnualDomainScore("love", year, relations, stage, luck, tenGod, branchGod, luckRelations, evidence),
      health: baziAnnualDomainScore("health", year, relations, stage, luck, tenGod, branchGod, luckRelations, evidence)
    };
    const priorStage = deps.annualStageProfile(age - 1);
    const priorScores = previousYearScores(year, pillars, priorStage, context, dayStem);
    const focusKey = deps.strongestAnnualDomain(domainScores);
    const weakestKey = deps.weakestAnnualDomain(domainScores);
    const domains = Object.fromEntries(Object.entries(domainScores).map(([key, score]) => {
      const trend = deps.annualTrend(score);
      return [key, {
        label: deps.annualDomainLabel(key),
        trend: baziDomainStatus(key, trend, { year, tenGod, relations, luckRelations, chart }),
        tone: trend.tone,
        score,
        delta: score - priorScores[key],
        text: baziAnnualDomainNarrative(key, {
          year, yearPillar, score, delta: score - priorScores[key], trend,
          stemElement, branchElement, stage, relations, stemRelations, luckRelations,
          luck, tenGod, annualStructure, chart, evidence
        })
      }];
    }));
    const theme = `${yearPillar}流年：${yearlyTheme(branch, pillars, age)}；${tenGod ? `${tenGod}主事` : "日主关系待复核"}；${luck && luck.ganZhi ? `行${luck.ganZhi}大运` : "起运前阶段"}`;
    const focus = deps.annualDomainLabel(focusKey);
    const signals = [`${yearPillar}流年`, `主气：${branchElement}`];
    if (relations.repeated.length) signals.push(`同支：${relations.repeated.map((item) => item.label).join("/")}`);
    if (relations.clashes.length) signals.push(`冲：${relations.clashes.map((item) => item.label).join("/")}`);
    if (relations.harmonies.length) signals.push(`合：${relations.harmonies.map((item) => item.label).join("/")}`);
    if (relations.punishments.length) signals.push(`刑：${relations.punishments.map((item) => item.label).join("/")}`);
    if (relations.harms.length) signals.push(`害：${relations.harms.map((item) => item.label).join("/")}`);
    if (relations.completedTrines.length) signals.push(relations.completedTrines[0].name);
    if (relations.completedMeetings.length) signals.push(relations.completedMeetings[0].name);
    if (stemRelations.combinations.length) signals.push(`天干合：${stem}${stemRelations.combinations[0].stem}`);
    if (stemRelations.clashes.length) signals.push(`天干相冲（部分流派）：${stem}${stemRelations.clashes[0].stem}`);
    if (evidence.strongTrigger) signals.push(evidence.strongTrigger.label);
    if (luckRelations && luckRelations.branch.clashes.length) signals.push(`冲大运：${luck.ganZhi}`);
    if (luck && luck.ganZhi && year === luck.startYear) signals.push("换大运");
    if (tenGod) signals.push(`十神：${tenGod}`);
    if (evidence.annualHidden.length) signals.push(`岁支藏干：${hiddenGodText(evidence.annualHidden)}`);
    signals.push(`岁干根气：${evidence.stemRoot.level === "有承接" ? "不弱" : evidence.stemRoot.level}`);
    if (evidence.control) signals.push(`制化：${evidence.control.label}`);
    if (evidence.void.active) signals.push(evidence.void.filled ? `旬空有动：${branch}` : `日柱旬空：${branch}`);
    if (luck && luck.ganZhi) signals.push(`大运：${luck.ganZhi}`);
    if (context.personalEvidence) signals.push("三法合看");
    if (!isValidDayPillar(pillars.day)) signals.push("日柱待复核");
    return {
      year,
      age,
      yearPillar,
      stage: stage.label,
      theme,
      focus,
      overview: baziAnnualOverview({ year, age, yearPillar, stem, branch, stemElement, branchElement, stage, relations, stemRelations, luckRelations, luck, tenGod, annualStructure, chart, focusKey, weakestKey, evidence }),
      domains,
      keyPeriods: baziYearPeriods(stemElement, branchElement, relations, tenGod, luck, { year, yearPillar, luckRelations, chart, evidence }),
      caution: baziAnnualCaution(relations, weakestKey, yearPillar, tenGod, luck, { year, luckRelations, chart, evidence, annualStructure }),
      actions: baziAnnualActions(focusKey, weakestKey, stage, relations, { year, yearPillar, tenGod, luck, luckRelations, chart, evidence, delta: domainScores[focusKey] - priorScores[focusKey] }),
      synthesis: crossMethodSynthesis(context.personalEvidence, { year, age, yearPillar, focusKey, weakestKey, tenGod, luck, luckRelations, annualStructure, relations, chart, evidence, stage }),
      basis: baziAnnualBasis(yearPillar, stemElement, branchElement, pillars, relations, context, luck, tenGod, { year, age, stemRelations, luckRelations, evidence }),
      evidenceTier: isValidDayPillar(pillars.day) ? "four_pillar_reference" : "known_pillars_reference",
      signals,
      relations,
      stemRelations,
      luckRelations,
      luckCycle: luck,
      tenGod,
      annualStructure,
      evidence
    };
  }

  function baziTimelineProvider(birthYear, pillars, range = { startYear: birthYear, endYear: birthYear + 100 }, context = {}) {
    const luckKey = `${context.luckStart?.solar || ""}:${(context.luckCycles || []).map((item) => `${item.startYear}-${item.endYear}-${item.ganZhi}`).join("|")}`;
    const key = `bazi:v4:${birthYear}:${range.startYear}:${range.endYear}:${pillars.year}:${pillars.month}:${pillars.day}:${pillars.hour}:${luckKey}`;
    return dependencies().createLazyTimelineProvider("bazi", range, key, (year) => baziTimelineYear(birthYear, pillars, year, context));
  }

  function knownPillarBranches(pillars) {
    const labels = { year: "年支", month: "月支", day: "日支", hour: "时支", luck: "大运支" };
    return Object.entries(labels).flatMap(([key, label]) => {
      const text = String(pillars[key] || "");
      const branch = branches.find((candidate) => text.includes(candidate));
      return branch ? [{ key, label, branch }] : [];
    });
  }

  function baziBranchRelations(branch, pillars) {
    const clashes = { 子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅", 卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳" };
    const harmonies = { 子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯", 辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午" };
    const harms = { 子: "未", 未: "子", 丑: "午", 午: "丑", 寅: "巳", 巳: "寅", 卯: "辰", 辰: "卯", 申: "亥", 亥: "申", 酉: "戌", 戌: "酉" };
    const breaks = { 子: "酉", 酉: "子", 丑: "辰", 辰: "丑", 寅: "亥", 亥: "寅", 卯: "午", 午: "卯", 巳: "申", 申: "巳", 未: "戌", 戌: "未" };
    const punishmentGroups = [
      { name: "寅巳申三刑", branches: ["寅", "巳", "申"] },
      { name: "丑未戌三刑", branches: ["丑", "未", "戌"] },
      { name: "子卯刑", branches: ["子", "卯"] }
    ];
    const trines = [
      { name: "申子辰三合水局", branches: ["申", "子", "辰"] },
      { name: "亥卯未三合木局", branches: ["亥", "卯", "未"] },
      { name: "寅午戌三合火局", branches: ["寅", "午", "戌"] },
      { name: "巳酉丑三合金局", branches: ["巳", "酉", "丑"] }
    ];
    const meetings = [
      { name: "寅卯辰三会木方", branches: ["寅", "卯", "辰"] },
      { name: "巳午未三会火方", branches: ["巳", "午", "未"] },
      { name: "申酉戌三会金方", branches: ["申", "酉", "戌"] },
      { name: "亥子丑三会水方", branches: ["亥", "子", "丑"] }
    ];
    const known = knownPillarBranches(pillars);
    const knownSet = new Set(known.map((item) => item.branch));
    const punishments = known.filter((item) => punishmentGroups.some((group) => group.branches.includes(branch) && group.branches.includes(item.branch) && item.branch !== branch));
    if (["辰", "午", "酉", "亥"].includes(branch)) punishments.push(...known.filter((item) => item.branch === branch));
    const completed = (groups) => groups.filter((group) => group.branches.includes(branch) && group.branches.every((item) => item === branch || knownSet.has(item)));
    return {
      known,
      repeated: known.filter((item) => item.branch === branch),
      clashes: known.filter((item) => item.branch === clashes[branch]),
      harmonies: known.filter((item) => item.branch === harmonies[branch]),
      harms: known.filter((item) => item.branch === harms[branch]),
      breaks: known.filter((item) => item.branch === breaks[branch]),
      punishments,
      completedPunishments: completed(punishmentGroups),
      completedTrines: completed(trines),
      completedMeetings: completed(meetings)
    };
  }

  function knownPillarStems(pillars) {
    const labels = { year: "年干", month: "月干", day: "日干", hour: "时干", luck: "大运干" };
    return Object.entries(labels).flatMap(([key, label]) => {
      const stem = stems.find((candidate) => String(pillars[key] || "").startsWith(candidate));
      return stem ? [{ key, label, stem }] : [];
    });
  }

  function baziStemRelations(stem, pillars) {
    const combinations = { 甲: "己", 己: "甲", 乙: "庚", 庚: "乙", 丙: "辛", 辛: "丙", 丁: "壬", 壬: "丁", 戊: "癸", 癸: "戊" };
    const clashes = { 甲: "庚", 庚: "甲", 乙: "辛", 辛: "乙", 丙: "壬", 壬: "丙", 丁: "癸", 癸: "丁" };
    const known = knownPillarStems(pillars);
    return {
      known,
      repeated: known.filter((item) => item.stem === stem),
      combinations: known.filter((item) => item.stem === combinations[stem]),
      clashes: known.filter((item) => item.stem === clashes[stem])
    };
  }

  function baziLuckRelations(yearPillar, luck, year) {
    if (!luck || !luck.ganZhi) return null;
    return {
      branch: baziBranchRelations(yearPillar[1], { luck: luck.ganZhi }),
      stem: baziStemRelations(yearPillar[0], { luck: luck.ganZhi }),
      phase: year === luck.startYear ? "opening" : year === luck.endYear ? "closing" : "middle"
    };
  }

  function baziAnnualDomainScore(domain, year, relations, stage, luck = null, tenGod = "", branchGod = "", luckRelations = null, evidence = null) {
    const annualStemWeight = tenGodDomainWeight(tenGod, domain) * 0.9;
    const annualBranchWeight = evidence
      ? evidence.annualHidden.reduce((sum, item) => sum + tenGodDomainWeight(item.tenGod, domain) * item.share, 0)
      : tenGodDomainWeight(branchGod, domain);
    const luckWeight = evidence
      ? tenGodDomainWeight(evidence.luckStemGod, domain) * 0.25
        + evidence.luckHidden.reduce((sum, item) => sum + tenGodDomainWeight(item.tenGod, domain) * item.share * 0.35, 0)
      : 0;
    const targetKeys = {
      career: ["month", "hour", "year", "luck"],
      wealth: ["month", "hour", "day", "luck"],
      love: ["day", "month", "luck"],
      health: ["day", "luck", "year"]
    }[domain];
    const targetMoves = evidence ? evidence.moves.filter((item) => targetKeys.includes(item.key)) : [];
    const relationAdjustment = targetMoves.reduce((sum, item) => {
      if (item.type === "harmony") return sum + (domain === "love" ? 2.5 : 1.5);
      if (item.type === "repeat") return sum + (domain === "health" ? -1.5 : 0.5);
      if (item.type === "clash") return sum - (["love", "health"].includes(domain) ? 4.5 : 3);
      if (item.type === "harm" || item.type === "break") return sum - (domain === "love" ? 3 : 1.8);
      if (item.type === "punishment") return sum - (["love", "health"].includes(domain) ? 3 : 2);
      return sum;
    }, 0)
      + (relations.completedTrines.length || relations.completedMeetings.length ? (domain === "career" ? 3 : 1) : 0)
      - (luckRelations && luckRelations.branch.clashes.length ? (domain === "health" ? 3 : 1.5) : 0);
    const structureAdjustment = evidence && evidence.control
      ? ({ career: 3, wealth: 1.5, love: 0.5, health: -1.5 })[domain]
      : 0;
    const voidAdjustment = evidence && evidence.void.active
      ? (evidence.void.filled ? ({ career: -1, wealth: -2, love: -1.5, health: -0.5 })[domain] : ({ career: -3, wealth: -4, love: -3, health: -1 })[domain])
      : 0;
    const rootAdjustment = evidence && evidence.stemRoot.level === "足" ? (domain === "health" ? -0.5 : 1.5)
      : evidence && evidence.stemRoot.level === "无根" ? (["career", "wealth"].includes(domain) ? -2 : 0)
        : 0;
    return clamp(Math.round(51 + annualStemWeight + annualBranchWeight + luckWeight + relationAdjustment + structureAdjustment + voidAdjustment + rootAdjustment + stage.modifiers[domain]), 35, 88);
  }

  function luckCycleForYear(context, year) {
    const cycles = context && Array.isArray(context.luckCycles) ? context.luckCycles : [];
    return cycles.find((item) => year >= item.startYear && year <= item.endYear) || null;
  }

  function previousYearScores(year, pillars, stage, context, dayStem) {
    const previousYear = year - 1;
    const pillar = cycle[mod(previousYear - 4, 60)];
    const relations = baziBranchRelations(pillar[1], pillars);
    const luck = luckCycleForYear(context, previousYear);
    const luckRelations = baziLuckRelations(pillar, luck, previousYear);
    const tenGod = tenGodFor(dayStem, pillar[0]);
    const stemRelations = baziStemRelations(pillar[0], pillars);
    const evidence = annualEvidenceProfile({
      year: previousYear,
      yearPillar: pillar,
      stem: pillar[0],
      branch: pillar[1],
      dayStem,
      tenGod,
      relations,
      stemRelations,
      luckRelations,
      luck
    }, pillars);
    const branchGod = evidence.annualHidden[0] ? evidence.annualHidden[0].tenGod : "";
    return Object.fromEntries(["career", "wealth", "love", "health"].map((domain) => [
      domain,
      baziAnnualDomainScore(domain, previousYear, relations, stage, luck, tenGod, branchGod, luckRelations, evidence)
    ]));
  }

  function tenGodFor(dayStem, otherStem) {
    const dayIndex = stems.indexOf(dayStem);
    const otherIndex = stems.indexOf(otherStem);
    if (dayIndex < 0 || otherIndex < 0) return "";
    const dayElement = elementOf(dayStem);
    const otherElement = elementOf(otherStem);
    const samePolarity = dayIndex % 2 === otherIndex % 2;
    if (dayElement === otherElement) return samePolarity ? "比肩" : "劫财";
    if (generates(dayElement, otherElement)) return samePolarity ? "食神" : "伤官";
    if (generates(otherElement, dayElement)) return samePolarity ? "偏印" : "正印";
    if (controls(dayElement, otherElement)) return samePolarity ? "偏财" : "正财";
    if (controls(otherElement, dayElement)) return samePolarity ? "七杀" : "正官";
    return "";
  }

  function generates(source, target) {
    return ({ 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" })[source] === target;
  }

  function controls(source, target) {
    return ({ 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" })[source] === target;
  }

  function elementInteraction(stemElement, branchElement) {
    if (stemElement === branchElement) return { key: "same", label: `${stemElement}气同类叠加` };
    if (generates(stemElement, branchElement)) return { key: "stem_generates_branch", label: `天干${stemElement}生地支${branchElement}` };
    if (generates(branchElement, stemElement)) return { key: "branch_generates_stem", label: `地支${branchElement}生天干${stemElement}` };
    if (controls(stemElement, branchElement)) return { key: "stem_controls_branch", label: `天干${stemElement}制地支${branchElement}（盖头）` };
    if (controls(branchElement, stemElement)) return { key: "branch_controls_stem", label: `地支${branchElement}制天干${stemElement}（截脚）` };
    return { key: "mixed", label: `${stemElement}${branchElement}并见` };
  }

  function tenGodDomainWeight(tenGod, domain) {
    const family = tenGodFamily(tenGod);
    const weights = {
      peer: { career: 4, wealth: -1, love: 2, health: 1 },
      output: { career: 6, wealth: 3, love: 4, health: -1 },
      wealth: { career: 3, wealth: 7, love: 3, health: -1 },
      officer: { career: 7, wealth: 2, love: 2, health: -2 },
      resource: { career: 5, wealth: 1, love: 2, health: 3 }
    };
    return weights[family] ? weights[family][domain] : 0;
  }

  function tenGodFamily(tenGod) {
    if (["比肩", "劫财"].includes(tenGod)) return "peer";
    if (["食神", "伤官"].includes(tenGod)) return "output";
    if (["偏财", "正财"].includes(tenGod)) return "wealth";
    if (["七杀", "正官"].includes(tenGod)) return "officer";
    if (["偏印", "正印"].includes(tenGod)) return "resource";
    return "";
  }

  function hiddenGodsForBranch(branch, dayStem) {
    return (branchHiddenStems[branch] || []).map((item) => ({
      ...item,
      tenGod: tenGodFor(dayStem, item.stem)
    }));
  }

  function dayVoidBranches(dayPillar) {
    const index = cycle.indexOf(String(dayPillar || ""));
    if (index < 0) return [];
    const firstBranchIndex = mod(Math.floor(index / 10) * 10, 12);
    return [branches[mod(firstBranchIndex + 10, 12)], branches[mod(firstBranchIndex + 11, 12)]];
  }

  function annualStemRootProfile(stem, annualBranch, pillars, luck) {
    const sources = [
      { key: "annual", label: "岁支", branch: annualBranch },
      ...knownPillarBranches(pillars),
      ...(luck && luck.ganZhi ? [{ key: "luck", label: "大运支", branch: luck.ganZhi[1] }] : [])
    ];
    const roots = sources.flatMap((source) => {
      const candidates = (branchHiddenStems[source.branch] || []).filter((item) => elementOf(item.stem) === elementOf(stem));
      if (!candidates.length) return [];
      const strongest = candidates.sort((a, b) => b.share - a.share)[0];
      return [{
        ...source,
        hiddenStem: strongest.stem,
        tenGod: "",
        exact: strongest.stem === stem,
        rank: strongest.rank,
        strength: strongest.share * (strongest.stem === stem ? 1 : 0.72)
      }];
    });
    const total = roots.reduce((sum, item) => sum + item.strength, 0);
    const level = total >= 1.35 ? "足" : total >= 0.55 ? "有承接" : roots.length ? "浅" : "无根";
    return { stem, roots, total, level };
  }

  function annualControlStructure(annualGod, annualHidden, luckStemGod, luckHidden) {
    const hiddenGods = [...annualHidden, ...luckHidden].map((item) => item.tenGod).filter(Boolean);
    const all = new Set([annualGod, luckStemGod, ...hiddenGods].filter(Boolean));
    const annualFamily = tenGodFamily(annualGod);
    const hasResource = ["正印", "偏印"].some((god) => all.has(god));
    const hasOfficer = ["正官", "七杀"].some((god) => all.has(god));
    const hasWealth = ["正财", "偏财"].some((god) => all.has(god));
    const hasOutput = ["食神", "伤官"].some((god) => all.has(god));
    if (annualGod === "伤官" && hasOfficer && hasResource) {
      return { key: "resource-controls-hurting", label: "印制伤官护官", text: "表达、质疑和创新要有方法、事实与正式沟通托底，印星有没有发挥作用，要看意见能否变成可执行的方案。" };
    }
    if (annualGod === "伤官" && hasOfficer) {
      return { key: "hurting-meets-officer", label: "伤官见官", text: "观点和规则正面碰上，邮件、审批、合同与公开表达都要留痕，少用情绪替代程序。" };
    }
    if (annualGod === "食神" && all.has("七杀")) {
      return { key: "food-controls-kill", label: "食神制杀", text: "高压任务要靠技术、作品、研究和稳定交付来化，不靠正面硬顶。" };
    }
    if (["七杀", "正官"].includes(annualGod) && hasResource) {
      return { key: "officer-resource", label: annualGod === "七杀" ? "杀印相生" : "官印相生", text: "方法、资质和平台齐备，压力才可能转成正式位置，权限、人手或流程不足时，先补条件，再接更重的责任。" };
    }
    if (annualFamily === "resource" && ["正官", "七杀"].includes(luckStemGod)) {
      return { key: "resource-receives-officer", label: luckStemGod === "七杀" ? "印承七杀" : "官印相接", text: "当年印星把大运里的规则和责任转成方法、资质与流程，准备之后还要做出成果，位置才站得住。" };
    }
    if (annualFamily === "wealth" && hasOfficer) {
      return { key: "wealth-officer", label: "财官相接", text: "客户、收入和现实资源会接到职位、合同与责任上，收益和义务必须一起核算。" };
    }
    if (["output", "wealth"].includes(annualFamily) && hasOutput && hasWealth) {
      return { key: "output-wealth", label: "食伤生财", text: "收入更依赖作品、技术、信息和实际成交，先跑通一条能收款的路径，再谈扩大。" };
    }
    if (annualFamily === "peer" && hasWealth) {
      return { key: "peer-wealth", label: "比劫临财", text: "机会出现时也会带来同辈竞争、共同投入或分账问题，流水扣掉分账和成本，才是实际留下的钱。" };
    }
    return null;
  }

  function pillarAxisForAge(key, age) {
    const axes = age < 18 ? youthPillarAxes : pillarAxes;
    return axes[key] || "";
  }

  function annualControlTextForAge(control, age) {
    if (!control || age >= 18) return control ? control.text : "";
    const youthText = {
      "resource-controls-hurting": "表达和质疑要有学习方法、事实依据与清楚规则托底，重点是把意见说完整，不把正常表达解释成与成人权威的冲突。",
      "hurting-meets-officer": "自己的意见与学校或家庭规则同场时，按事实、步骤和明确约定沟通，比情绪顶撞或闷着不说更有效。",
      "food-controls-kill": "学习压力宜拆成技能、作品和稳定练习来消化，成绩高低仍以作业、考试和真实表现为准。",
      "officer-resource": "要求和压力若配有方法、练习、成人支持与休息，更容易变成成长经验；支持不到位时先减量。",
      "resource-receives-officer": "把阶段里的规则和要求变成学习方法与日常流程，准备之后还要拿作业、作品或真实表现说明效果。",
      "wealth-officer": "现实任务、家庭资源和规则会同时出现，先看时间、支持条件与责任是否匹配，不套成人财职结论。",
      "output-wealth": "兴趣和表达要经过作业、作品或持续练习验证，能否长期完成比一时热度更值得记录。",
      "peer-wealth": "同伴比较、共同活动与家庭资源边界可能同时出现，重点是学会协商、轮流和保留自己的节奏。"
    };
    return youthText[control.key] || "传统组合只用来整理学习、家庭与成长经历，性格和成绩仍由当时表现说明。";
  }

  function annualRelationMoves(relations, luckRelations, age) {
    const relationSets = [
      ["repeat", relations.repeated],
      ["clash", relations.clashes],
      ["harmony", relations.harmonies],
      ["harm", relations.harms],
      ["break", relations.breaks],
      ["punishment", relations.punishments]
    ];
    const moves = relationSets.flatMap(([type, items]) => items.map((item) => ({
      type,
      key: item.key,
      label: item.label,
      branch: item.branch,
      axis: pillarAxisForAge(item.key, age)
    })));
    if (luckRelations) {
      const luckSets = [
        ["clash", luckRelations.branch.clashes],
        ["harmony", luckRelations.branch.harmonies],
        ["harm", luckRelations.branch.harms],
        ["break", luckRelations.branch.breaks],
        ["repeat", luckRelations.branch.repeated]
      ];
      for (const [type, items] of luckSets) {
        if (items.length) moves.push({ type, key: "luck", label: "大运支", branch: items[0].branch, axis: pillarAxisForAge("luck", age) });
      }
    }
    const seen = new Set();
    return moves.filter((item) => {
      const key = `${item.type}:${item.key}:${item.branch}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function annualEvidenceProfile(facts, pillars) {
    const annualHidden = hiddenGodsForBranch(facts.branch, facts.dayStem);
    const luckStemGod = facts.luck && facts.luck.ganZhi ? tenGodFor(facts.dayStem, facts.luck.ganZhi[0]) : "";
    const luckHidden = facts.luck && facts.luck.ganZhi ? hiddenGodsForBranch(facts.luck.ganZhi[1], facts.dayStem) : [];
    const stemRoot = annualStemRootProfile(facts.stem, facts.branch, pillars, facts.luck);
    const voidBranches = dayVoidBranches(pillars.day);
    const voidActive = voidBranches.includes(facts.branch);
    const sameStemInVoid = voidActive && annualHidden.some((item) => item.stem === facts.stem);
    const relationMoves = annualRelationMoves(facts.relations, facts.luckRelations, facts.age);
    const stemClashes = facts.stemRelations ? facts.stemRelations.clashes : [];
    const strongTrigger = stemClashes.flatMap((stemMove) => {
      const branchMove = facts.relations.clashes.find((item) => item.key === stemMove.key);
      return branchMove ? [{
        key: stemMove.key,
        label: `${facts.yearPillar}天克地冲${stemMove.label.replace("干", "柱")}${stemMove.stem}${branchMove.branch}`,
        axis: pillarAxisForAge(stemMove.key, facts.age)
      }] : [];
    })[0] || null;
    const voidMoved = voidActive && relationMoves.some((item) => item.branch === facts.branch || item.key === "luck");
    return {
      annualHidden,
      luckStemGod,
      luckHidden,
      stemRoot,
      void: {
        branches: voidBranches,
        active: voidActive,
        filled: sameStemInVoid || voidMoved,
        basis: sameStemInVoid ? `${facts.stem}透出并坐在${facts.branch}中同干` : voidMoved ? "空支同时被原局或大运冲合牵动" : ""
      },
      control: annualControlStructure(facts.tenGod, annualHidden, luckStemGod, luckHidden),
      moves: relationMoves,
      strongTrigger
    };
  }

  function hiddenGodText(items) {
    return items.map((item) => `${item.stem}${item.tenGod ? item.tenGod : ""}${item.rank ? `（${item.rank}）` : ""}`).join("、");
  }

  function stemRootText(root, facts = {}) {
    if (!root || !root.roots.length) {
      const topic = facts.tenGod ? `${facts.tenGod}主题` : "岁干主题";
      return `${facts.year || "当年"}的${root ? root.stem : "岁干"}在岁支、原局和当前大运支里都没找到同类藏气，${topic}能否做实，还要看当时具不具备条件。`;
    }
    const shown = root.roots.slice(0, 4).map((item) => `${item.label}${item.branch}藏${item.hiddenStem}${item.rank}`).join("、");
    return `${facts.year || "当年"}的${root.stem}在${shown}见根，${root.level === "足" ? "根气较足" : root.level === "有承接" ? "根气不弱" : "但根气偏浅"}。`;
  }

  function natalChartProfile(pillars) {
    return {
      personal: false,
      strength: "待按月令复核",
      useful: [],
      heavy: [],
      monthCommand: "",
      voidBranches: dayVoidBranches(pillars.day),
      core: `${pillars.day || "日柱待复核"}生于${pillars.month || "月柱待复核"}月，先看月令、日主有没有根和帮扶，再看财官食伤是否有承接。`,
      thermal: "寒热只作传统季节校验，不能绕过月令、原局组合和现实经历单独下结论。"
    };
  }

  function personalAnnualSpotlight(year, chart) {
    return null;
  }

  function natalAnnualFit(chart, tenGod) {
    if (!chart.personal) return chart.core;
    return ({
      peer: "原局天干金已经很集中，同类再来时，优势是执行和主见，难点是竞争、分工与听取反馈。",
      output: "原局水藏在申辰而没有透干，食伤来到表面时，表达、技术输出和迁移会比平常更明显。",
      wealth: "寅月本就把财星放在现实舞台上，财星透出时，钱、客户和关系会一起要求本人作选择。",
      officer: "原局金有根也有帮，火来并非只有压力；用得好是标准、职位和锻炼，用过头则是长期紧绷。",
      resource: "原局已有辰土为根，印星再来适合学习和稳住方法，但过多也会让准备时间挤掉实际行动。"
    })[tenGodFamily(tenGod)] || chart.core;
  }

  function baziAnnualOverview(facts) {
    const spot = personalAnnualSpotlight(facts.year, facts.chart);
    const phase = facts.luckRelations && facts.luckRelations.phase;
    const youth = facts.age < 18;
    const overviewVariant = mod(facts.year + Math.floor(facts.year / 10), 8);
    const middleLuckText = facts.luck && facts.luck.ganZhi ? (youth ? [
      `${facts.year}处在${facts.luck.ganZhi}大运中段，${facts.yearPillar}${facts.tenGod}落到学习方法、家庭支持和成长任务`,
      `${facts.luck.ganZhi}大运走到${facts.year}，${facts.yearPillar}${facts.tenGod}落在学习节奏、家庭支持和成长任务`,
      `${facts.year}仍在${facts.luck.ganZhi}大运内，${facts.yearPillar}${facts.tenGod}先看方法、照护和适应变化`,
      `以${facts.luck.ganZhi}大运为阶段背景，${facts.year}的${facts.yearPillar}${facts.tenGod}对应学习、家庭和日常适应`,
      `${facts.year}仍在${facts.luck.ganZhi}大运里，${facts.yearPillar}${facts.tenGod}把变化带到学习与家庭安排`,
      `${facts.luck.ganZhi}大运走到中段，${facts.year}的${facts.yearPillar}${facts.tenGod}先看学习方法与支持条件怎样配合`,
      `${facts.year}仍处在${facts.luck.ganZhi}大运，${facts.yearPillar}${facts.tenGod}可从学习、照护和成长经历里找对应`,
      `从${facts.luck.ganZhi}大运看${facts.year}，${facts.yearPillar}${facts.tenGod}会落到已有的学习和家庭节奏上`
    ] : [
      `${facts.year}处在${facts.luck.ganZhi}大运中段，${facts.yearPillar}${facts.tenGod}会碰到已经承担的责任和手头条件`,
      `${facts.luck.ganZhi}大运走到${facts.year}，${facts.yearPillar}${facts.tenGod}要在既有职责和资源中找位置`,
      `${facts.year}仍在${facts.luck.ganZhi}大运内，${facts.yearPillar}${facts.tenGod}主要看已有责任是否配得上时间、人手和条件`,
      `以${facts.luck.ganZhi}大运为十年背景，${facts.year}的${facts.yearPillar}${facts.tenGod}落到职责、资源与执行`,
      `${facts.year}仍在${facts.luck.ganZhi}大运里，${facts.yearPillar}${facts.tenGod}把选择带到现有责任上`,
      `${facts.luck.ganZhi}大运走到中段，${facts.year}的${facts.yearPillar}${facts.tenGod}先看平台、资源和责任能否配齐`,
      `${facts.year}仍受${facts.luck.ganZhi}大运影响，${facts.yearPillar}${facts.tenGod}要从已有条件中找到着力处`,
      `从${facts.luck.ganZhi}大运看${facts.year}，${facts.yearPillar}${facts.tenGod}会落到已经承担的事情上`
    ])[overviewVariant] : "";
    const preLuckText = [
      `${facts.year}尚未正式起运，主要看家庭、学习和成长环境`,
      `${facts.year}仍在起运前，先查家庭照护、学习环境和日常适应`,
      `${facts.year}处在起运前阶段，只谈家庭支持、成长经历和生活环境`,
      `${facts.year}还在起运前，能回看的材料主要是家庭、学习和健康档案`,
      `起运前的${facts.year}先看照护方式、居住环境和早期学习经历`,
      `${facts.year}尚属起运前，家庭资源与成长环境是主要背景`,
      `${facts.year}没有进入正式大运，回看家庭、学习与生活节奏即可`,
      `对${facts.year}而言，起运前环境比套用成人事业财务分类更贴切`
    ][overviewVariant];
    const luckText = facts.luck && facts.luck.ganZhi
      ? phase === "opening" ? youth
        ? `${facts.year}进入${facts.luck.ganZhi}大运，起运前后的学习、家庭支持和成长经历要分开看`
        : `${facts.year}进入${facts.luck.ganZhi}大运，旧运收尾与新运起步必须分开看`
        : phase === "closing" ? youth
          ? `${facts.year}是${facts.luck.ganZhi}大运收官，先整理这一阶段的学习方法、家庭支持和成长变化`
          : `${facts.year}是${facts.luck.ganZhi}大运收官，先清旧责任，再决定什么带入下一运`
          : middleLuckText
      : preLuckText;
    const evidence = facts.evidence;
    const hidden = evidence && evidence.annualHidden.length ? hiddenGodText(evidence.annualHidden) : "藏干待查";
    const headline = spot ? spot.headline : annualEvidenceHeadline(facts);
    const controlLead = evidence && evidence.control ? [
      `${facts.year}的${facts.yearPillar}与当前大运同看，制化重点在${evidence.control.label}`,
      `把${facts.yearPillar}放进${facts.luck && facts.luck.ganZhi ? `${facts.luck.ganZhi}大运` : "起运前背景"}，${facts.year}的制化落在${evidence.control.label}`,
      `${facts.year}把${facts.yearPillar}${facts.tenGod}放进当前阶段，${evidence.control.label}说明事情怎样转化`,
      `${facts.yearPillar}在${facts.year}接到大运条件后，${evidence.control.label}比只看${facts.tenGod}多了一层依据`,
      `${facts.year}的制化落在${evidence.control.label}`,
      `${facts.year}处理${facts.yearPillar}${facts.tenGod}时，${evidence.control.label}给出可用的方法`,
      `${facts.year}把${facts.yearPillar}放进当前大运，先看${evidence.control.label}`,
      `${facts.year}的${facts.yearPillar}放进当前阶段，${evidence.control.label}说明压力或资源怎样转化`
    ][overviewVariant] : "";
    const control = evidence && evidence.control
      ? `${controlLead}，${annualControlTextForAge(evidence.control, facts.age)}`
      : `${facts.year}的${facts.yearPillar}干支自关系为${facts.annualStructure.label}，岁干十神要和岁支底盘一起读。`;
    const relation = baziRelationNarrative(facts);
    return `${headline}。${facts.year}的${facts.yearPillar}岁干为${facts.tenGod || "日主关系待查"}，岁支藏${hidden}；${luckText}。${stemRootText(evidence && evidence.stemRoot, facts)} ${control} ${relation}`;
  }

  function annualEvidenceHeadline(facts) {
    const evidence = facts.evidence || {};
    if (evidence.strongTrigger) return `${evidence.strongTrigger.label}，先处理${evidence.strongTrigger.axis}的实际变化`;
    if (evidence.void && evidence.void.active) return facts.age < 18
      ? `${facts.yearPillar}落日柱旬空，先翻同期资料、家庭回忆和当时变化，再谈结果`
      : `${facts.yearPillar}落日柱旬空，先验合同、到账、承诺和执行，再谈结果`;
    const direct = (evidence.moves || []).find((item) => ["day", "month", "luck", "hour", "year"].includes(item.key));
    if (direct) {
      const verb = ({ clash: "冲动", harmony: "合住", harm: "暗牵", break: "改动", repeat: "重提", punishment: "挤压" })[direct.type] || "触及";
      return `${facts.yearPillar}${verb}${direct.label}，${facts.year}的重心落在${direct.axis}`;
    }
    if (evidence.control) return `${evidence.control.label}成立，解决问题的方式比单看${facts.tenGod}更关键`;
    return `${facts.tenGod || "流年主气"}透出，岁支${hiddenGodText(evidence.annualHidden || []) || "藏干待查"}决定它有没有条件发挥`;
  }

  function baziDomainStatus(domain, trend, facts) {
    const spot = personalAnnualSpotlight(facts.year, facts.chart);
    if (spot) return spot.labels[domain];
    const family = tenGodFamily(facts.tenGod);
    const labels = {
      peer: { career: "协作与竞争", wealth: "分清共同账", love: "平等不较劲", health: "别跟着别人耗" },
      output: { career: "让成果说话", wealth: "技能换收入", love: "表达要倾听", health: "输出后恢复" },
      wealth: { career: "回报要算成本", wealth: "现金流变具体", love: "现实条件上桌", health: "别拿身体换钱" },
      officer: { career: "规则与位置", wealth: "先守合规", love: "承诺要能承担", health: "恢复也是纪律" },
      resource: { career: "先补方法", wealth: "先懂再投", love: "支持别变依赖", health: "按专业意见来" }
    };
    return labels[family] ? labels[family][domain] : trend.label;
  }

  function tenGodDomainLead(domain, facts) {
    const text = {
      比肩: {
        career: "比肩透出，事情更容易由自己承担，也更容易遇到同水平竞争；职责、署名和决定权必须先划清。",
        wealth: "比肩年份先分自己的钱、共同的钱和项目的钱，替人垫付或共同投入都要设上限。",
        love: "关系里自主性变强，能并肩做事是优点，但别把每次分歧都处理成谁听谁的。",
        health: "主见和耐力会上来，最容易忽略的是已经累了还继续证明自己能扛。"
      },
      劫财: {
        career: "劫财透出时，同辈、人脉和资源交换会更活跃；合作可以借力，分工含糊就会变成争功和反复。能借谁的力、成果算谁的，要在开工前写清。",
        wealth: "劫财并不等于必定破财，它先提示分账、人情、共同成本和竞争性报价，净收益比流水更重要。",
        love: "外部人际容易挤进两个人的安排，关系是否稳定要看双方能不能守住时间和边界。",
        health: "团队节奏和社交消耗容易把休息切碎，别拿别人的强度当自己的标准。"
      },
      食神: {
        career: "食神看稳定输出：作品、技术、教学、研究或方案要能持续完成并被使用，不以一时灵感论高低。",
        wealth: "食神生财要经过交付和转化，先证明一条技能收入路径，再增加设备、推广或人员投入。",
        love: "互动会更自然，也更愿意分享；关系进展仍看时间、距离和责任能否安排。",
        health: "输出顺时容易忘记停机，连续写作、授课或用脑后要给身体明确的恢复段。"
      },
      伤官: {
        career: "伤官会把改进、质疑和表达带到台前，适合破题和优化；碰到制度时要用证据和正式程序保护成果。",
        wealth: "伤官的收入更依赖差异化能力和转化效率，报价越新颖，合同、验收和售后越要细。",
        love: "话会说得更直接，坦率有用，讽刺、抢结论和只讲道理会消耗亲密感。",
        health: "思维兴奋与不服约束容易拖晚作息；先管睡眠和压力，不把情绪反应解释成具体疾病。"
      },
      偏财: {
        career: "偏财偏外部客户、项目分成、渠道和资源置换，机会来得快，筛选成本也高。",
        wealth: "偏财要看回款、分成和退出，不把大额意向或短期流水当成已经赚到的钱。",
        love: "男命偏财也会牵动伴侣议题，但是否形成稳定关系必须再看日支和现实投入。",
        health: "外部事务一多，睡眠、饮食和运动最先被让位；收益不能靠长期透支兑换。"
      },
      正财: {
        career: "正财偏固定客户、长期合同、稳定岗位和可计算回报，重点是把责任和收益对齐。",
        wealth: "正财重现金流秩序：到账时间、固定成本、税费和储蓄率比表面增幅更重要。",
        love: "男命正财会让关系的现实条件上桌，是否适合长期要看居住、金钱和责任如何分配。",
        health: "稳定事务容易越积越多，别因为每件事都合理，就把休息从日程里全部挤掉。"
      },
      七杀: {
        career: "七杀对应高压竞争、时限和难题，能否变成位置取决于权限、资源以及有没有印星或食神承接。",
        wealth: "七杀年常先发生为履责成本、设备投入或合规压力，不能拿未来收入提前覆盖现有支出。",
        love: "压力会传进关系，说话和决定都更快；不要用忙碌代替说明，也不要在紧绷时下永久结论。",
        health: "高压期要盯睡眠、恢复和持续紧绷；任何不适按医学评估，不按七杀推病。"
      },
      正官: {
        career: "正官重正式职位、规则、证照和可被承认的责任，接受名分时也要确认权限和资源。",
        wealth: "正官要求合同、税务、借贷和担保合规，模糊口径会在后续变成真实成本。",
        love: "正官让承诺和秩序更重要，但不能脱离性别、配偶星和夫妻宫直接套婚期。",
        health: "纪律能稳住节奏，也可能变成长期绷紧；固定恢复时间和固定工作时间同样重要。"
      },
      偏印: {
        career: "偏印偏研究、非标方法、幕后能力和重新学习，适合换方法，不适合无限准备。先设验证期限，学到能交付便进入实作。",
        wealth: "偏印年先提高判断力，陌生投资和熟人背书都要核实，学习成本也要设预算。",
        love: "更需要理解与独处，沉默并不自动等于默契；重要安排仍要说出口。",
        health: "用脑和作息容易变得不规则，先恢复再求效率，持续不适照常检查。"
      },
      正印: {
        career: "正印偏平台背书、证书、正式学习和组织资源，适合把经验标准化并取得认可。",
        wealth: "正印先求稳健与保障，财务上适合清账、补制度、看懂产品后再配置。",
        love: "支持感会变重要，但照顾不能代替平等协商，也别让家人意见包办两个人的决定。",
        health: "正印适合恢复和按专业意见调整；所谓印星承接不能代替体检、治疗或规律生活。"
      }
    };
    return text[facts.tenGod] ? text[facts.tenGod][domain] : "日柱关系尚未确认，这一项只保留现实规划，不拿十神硬断。";
  }

  function baziDomainRelationText(domain, facts) {
    const priorities = {
      career: ["month", "luck", "hour", "year", "day"],
      wealth: ["month", "hour", "day", "luck", "year"],
      love: ["day", "month", "luck", "hour", "year"],
      health: ["day", "luck", "year", "hour", "month"]
    }[domain];
    const moves = facts.evidence && facts.evidence.moves || [];
    const move = priorities.map((key) => moves.find((item) => item.key === key)).find(Boolean);
    if (!move) return baziUnmovedDomainText(domain, facts);
    const target = move.axis || "相关安排";
    const templates = {
      career: {
        clash: `岁支冲到${move.label}，${target}需要重排；先确认岗位、客户、期限或项目哪一项真的改变，再决定是否换方向。`,
        harmony: `岁支合到${move.label}，${target}会出现更紧的合作或绑定；合作能不能长久，要看权责和退出方式。`,
        harm: `岁支与${move.label}有害意，${target}容易藏着信息差或兑现落差，口头说法要回到文件和实际交付。`,
        break: `岁支与${move.label}相破，${target}里的旧条件可能边做边改，版本、期限和责任人都要留记录。`,
        repeat: `岁支重复${move.label}，${target}的旧题会再次放大；这次应改变流程，而不是只增加工时。`,
        punishment: `${target}被刑意牵动，几件任务容易互相挤压；先排先后，再谈同时推进。`
      },
      wealth: {
        clash: `${move.label}被冲，${target}会带来调整成本；预算要同时算现金支出、时间损耗和最慢回款。`,
        harmony: `${move.label}被合，${target}更容易形成共同资源或长期账目；金额、产权和分成必须分开列。`,
        harm: `${move.label}见害，财务上要防承诺看着顺、实际到账不足；票据、验收和回款节点逐项核对。`,
        break: `${move.label}见破，原有预算或分配办法可能中途改口；没有书面变更，不追加投入。`,
        repeat: `${move.label}伏动，旧账、旧客户或旧支出会回来；先清历史余额，再开新资金线。`,
        punishment: `刑意进入${target}，资金要防多个窟窿同时开；垫资、借贷和共同支出分别设顶。`
      },
      love: {
        clash: `${move.label}受冲，${target}里的旧安排不再合身；冲不等于分开，但时间、城市和责任必须重新协商。`,
        harmony: `${move.label}被合，关系或合作更容易靠近，也更容易互相牵住；亲近之外还要保留边界。`,
        harm: `${move.label}见害，关系中的问题偏隐性：信息不同步、距离感或未说出口的期待比正面争吵更值得处理。`,
        break: `${move.label}见破，原先默认的计划可能改变；把双方能够做到的安排重新说一遍。`,
        repeat: `${move.label}重复，熟悉的相处模式会再出现；看行动有没有变化，不只听这次解释。`,
        punishment: `刑意落到${target}，情绪、工作和现实责任容易互相挤压；重大承诺避开最忙乱的阶段。`
      },
      health: {
        clash: `${move.label}受冲，生活节奏更容易被行程、工作或关系变化打断；睡眠和恢复要提前留位置。`,
        harmony: `${move.label}被合，责任和绑定会增加，别让所有人的安排都排在自己的休息前面。`,
        harm: `${move.label}见害，负荷常表现为不易察觉的持续消耗；用睡眠、情绪和疲劳记录观察，不自行诊断。`,
        break: `${move.label}见破，作息和训练容易断断续续；把运动简化成能长期执行的版本。`,
        repeat: `${move.label}伏动，旧疲劳或旧习惯容易重现；有持续症状时复诊，不靠忍耐拖过去。`,
        punishment: `刑意使多项压力互相叠加，最有效的处理是分批减载；这里不据此推断器官或疾病。`
      }
    };
    return templates[domain][move.type] || baziUnmovedDomainText(domain, facts);
  }

  function baziUnmovedDomainText(domain, facts) {
    const hidden = facts.evidence && facts.evidence.annualHidden || [];
    const hiddenText = hiddenGodText(hidden);
    if (domain === "career") return `这一年没有强冲合直接点中主业宫位，事业主要看${facts.tenGod}能否借岁支${hiddenText}完成一项拿得出手的成果。`;
    if (domain === "wealth") return `财务宫位未被强动，钱要回到岁支${hiddenText}的实际来源；不把十神名称直接换算成收益。`;
    if (domain === "love") {
      const spouseGod = facts.chart && facts.chart.gender === "male" ? ["正财", "偏财"].includes(facts.tenGod) : facts.chart && facts.chart.gender === "female" ? ["正官", "七杀"].includes(facts.tenGod) : false;
      return spouseGod
        ? `${facts.tenGod}虽牵动配偶星，但夫妻宫没有受到强冲合，先看日常相处和持续投入，配偶星出现本身定不了婚期。`
        : `配偶星和夫妻宫都没有形成同动，感情更看日常选择；不为凑齐四栏而虚构确定事件。`;
    }
    return `这一年没有强关系直接点中身体宫位，健康只谈工作负荷、睡眠和恢复，具体病症仍由医学检查说明。`;
  }

  function baziAnnualDomainNarrative(domain, facts) {
    const spot = personalAnnualSpotlight(facts.year, facts.chart);
    if (spot) return spot.domains[domain];
    const voidText = baziDomainVoidText(domain, facts);
    const controlText = domain === "career" && facts.evidence && facts.evidence.control ? `${facts.evidence.control.label}是本栏的关键：${facts.evidence.control.text}` : "";
    const structureText = domain === "wealth" ? `岁柱内部是${facts.annualStructure.label}，钱能不能落地要连岁干目标与岁支底盘一起看。` : "";
    const loveHiddenText = domain === "love" ? baziLoveHiddenCheck(facts) : "";
    const healthHiddenText = domain === "health" ? baziHealthHiddenCheck(facts) : "";
    return [tenGodDomainLead(domain, facts), baziDomainRelationText(domain, facts), loveHiddenText, healthHiddenText, controlText, structureText, voidText].filter(Boolean).join(" ");
  }

  function baziLoveHiddenCheck(facts) {
    const hidden = facts.evidence && facts.evidence.annualHidden || [];
    const hiddenFamily = tenGodFamily(hidden[0] && hidden[0].tenGod);
    return ({
      peer: "岁支主气又见比劫，相处时尤其要看彼此空间、同辈人情和共同开支能否分清。",
      output: "岁支主气落食伤，聊天和表达会增多，仍要观察对方是否愿意安排时间并兑现承诺。",
      wealth: "岁支主气带财，现实条件会更早进入关系，钱、距离和生活责任应当逐项谈清。",
      officer: "岁支主气带官杀，规则和责任感较重，关系质量取决于双方能否承担日常而不是只谈名分。",
      resource: "岁支主气带印，更需要理解和支持，也要防照顾慢慢变成依赖或由家人意见代替决定。"
    })[hiddenFamily] || "关系仍以持续行动、清楚沟通和现实安排为准。";
  }

  function baziHealthHiddenCheck(facts) {
    const hidden = facts.evidence && facts.evidence.annualHidden || [];
    const hiddenFamily = tenGodFamily(hidden[0] && hidden[0].tenGod);
    return ({
      peer: "岁支主气又见比劫，生活强度容易被同伴和团队带快；恢复量要按自己的睡眠与疲劳记录调整。",
      output: "岁支主气落食伤，脑力、表达和信息消耗更实；密集输出后要安排停止输入和规律活动。",
      wealth: "岁支主气带财，事务、客户和现实责任会占用日程；休息不能等所有事情做完才开始。",
      officer: "岁支主气带官杀，期限与规则压力更容易落到作息；连续紧绷时主动减载，并按需做正规检查。",
      resource: "岁支主气带印，恢复和专业支持更重要；不要用无限准备、保健品或自我观察替代就医。"
    })[hiddenFamily] || "健康部分只看睡眠、活动、持续症状和正规检查，不从岁支名称推断疾病。";
  }

  function baziDomainVoidText(domain, facts) {
    const state = facts.evidence && facts.evidence.void;
    if (!state || !state.active) return "";
    const filled = state.filled ? `同时又见${state.basis}，空处受到牵动，事情可能先虚后实` : "暂未见足够填实条件，先按进展偏慢处理";
    return ({
      career: `${facts.yearPillar}落日柱旬空，职位、立项、署名和验收不能只听口头；${filled}，以正式文件和完成结果为准。`,
      wealth: `旬空落到岁支，意向金额不算收入；${filled}，到账、票据和权责齐全后再扩张。`,
      love: `旬空会放大期待与现实的距离；${filled}，关系判断看持续行动、时间安排和真实投入。`,
      health: `旬空不是疾病信号；${filled}，身体部分仍只看睡眠、疲劳记录、体检和医生意见。`
    })[domain];
  }

  function baziRelationNarrative(facts) {
    const parts = [];
    const r = facts.relations;
    const youth = facts.age < 18;
    if (facts.evidence && facts.evidence.strongTrigger) parts.push(`${facts.year}出现${facts.evidence.strongTrigger.label}，${pillarAxisForAge(facts.evidence.strongTrigger.key, facts.age)}同动`);
    if (facts.stemRelations.combinations.length) parts.push(youth
      ? `${facts.year}的岁干${facts.yearPillar[0]}与原局${facts.stemRelations.combinations.map((item) => item.label).join("、")}相合，安排、兴趣或互动容易牵动原有节奏`
      : `${facts.year}的岁干${facts.yearPillar[0]}与原局${facts.stemRelations.combinations.map((item) => item.label).join("、")}相合，机会或关系会主动牵动原有节奏`);
    if (facts.stemRelations.clashes.length) parts.push(`${facts.year}若采用天干相冲一说，岁干${facts.yearPillar[0]}与原局${facts.stemRelations.clashes.map((item) => item.label).join("、")}相冲，表面目标与原有立场需要重新协调`);
    if (r.completedPunishments.length) {
      const annualBranch = facts.yearPillar[1];
      const punishmentContext = youth ? ({
        寅: "学习环境、同伴互动和个人节奏要分开查",
        巳: "家庭安排、学习压力和身体恢复要分项看",
        申: "同伴互动、适应状态和同期健康资料要放在一起看"
      })[annualBranch] : ({
        寅: "主业规则、外部责任和个人节奏会同时上桌",
        巳: "外部责任、主业节奏和关系边界容易同时收紧",
        申: "合作分工、个人决定和恢复节奏需要一并安排"
      })[annualBranch];
      parts.push(`${facts.year}的${annualBranch}支把${r.completedPunishments[0].name}带进当年，${punishmentContext || (youth ? "学习、家庭和适应经历要分开看" : "工作、关系和恢复安排要分出先后")}`);
    }
    else if (r.clashes.length) parts.push(`${facts.year}的${facts.yearPillar}冲到${r.clashes.map((item) => item.label).join("、")}，原有安排需要调整`);
    if (r.completedTrines.length) parts.push(`${facts.year}由${facts.yearPillar}使${r.completedTrines[0].name}成立，相关五行主题会集中`);
    if (r.completedMeetings.length) parts.push(`${facts.year}由${facts.yearPillar}使${r.completedMeetings[0].name}成立，季节一方之气更明显`);
    if (r.harmonies.length) parts.push(`${facts.year}的${facts.yearPillar}又合到${r.harmonies.map((item) => item.label).join("、")}，${youth ? "互动与安排" : "合作与牵绊"}并存`);
    if (r.harms.length) parts.push(`${facts.year}的${facts.yearPillar}与${r.harms.map((item) => item.label).join("、")}有害意，${youth ? "同期资料比口头回忆更可靠" : "口头说得顺，最后仍看实际兑现"}`);
    if (facts.luckRelations && facts.luckRelations.branch.clashes.length) parts.push(`${facts.year}的${facts.yearPillar}还冲到${facts.luck.ganZhi}大运支，当年节奏会和${youth ? "这一阶段的成长安排" : "十年安排"}正面碰撞`);
    if (!parts.length && r.repeated.length) parts.push(`${facts.year}的${facts.yearPillar}重复${r.repeated.map((item) => item.label).join("、")}，旧题会被放大`);
    if (facts.evidence && facts.evidence.void.active) parts.push(`${facts.year}的${facts.yearPillar}岁支落日柱旬空${facts.evidence.void.filled ? "而有填实信号，先虚后实" : "，进展快慢要另外观察"}`);
    return parts.length ? `${parts.join("；")}。` : `${facts.year}的${facts.yearPillar}没有强烈点中原局冲合，便转看${facts.tenGod}、岁支藏干与${facts.luck && facts.luck.ganZhi ? `${facts.luck.ganZhi}大运` : "起运前环境"}在生活里怎样表现。`;
  }

  function branchWindow(branch) {
    return ({ 寅: "2月4日至3月5日前后", 卯: "3月5日至4月4日前后", 辰: "4月4日至5月5日前后", 巳: "5月5日至6月5日前后", 午: "6月5日至7月6日前后", 未: "7月6日至8月7日前后", 申: "8月7日至9月7日前后", 酉: "9月7日至10月8日前后", 戌: "10月8日至11月7日前后", 亥: "11月7日至12月7日前后", 子: "12月7日至次年1月5日前后", 丑: "1月5日至2月4日前后" })[branch] || "全年";
  }

  function baziYearPeriods(stemElement, branchElement, relations, tenGod = "", luck = null, facts = {}) {
    const spot = personalAnnualSpotlight(facts.year, facts.chart || {});
    if (spot) return spot.periods;
    const annualBranch = facts.yearPillar ? facts.yearPillar[1] : "";
    const moves = facts.evidence && facts.evidence.moves || [];
    const relationNames = { clash: "冲", harmony: "合", harm: "害", break: "破", repeat: "伏动", punishment: "刑" };
    const extraWindows = moves.filter((item) => item.key !== "luck").slice(0, 2).map((item) =>
      `${branchWindow(item.branch)}再看${item.label}${relationNames[item.type] || "受动"}后，${item.axis}有没有实质变化`
    );
    const luckRepeatsAnnual = luck && luck.ganZhi && luck.ganZhi[1] === annualBranch;
    if (luck && moves.some((item) => item.key === "luck") && !luckRepeatsAnnual) extraWindows.push(`${branchWindow(luck.ganZhi[1])}检查流年和${luck.ganZhi}大运是否仍在拉扯`);
    const details = extraWindows.length ? `；${extraWindows.join("；")}` : "；年中再看交付、回款和已经确定的安排";
    const sameLuck = luckRepeatsAnnual ? `，又与${luck.ganZhi}大运同支，当年的事会接到十年安排上` : "";
    return `${branchWindow(annualBranch)}先看${annualBranch}支所藏${hiddenGodText(facts.evidence && facts.evidence.annualHidden || [])}怎样表现${sameLuck}${details}。`;
  }

  function baziAnnualCaution(relations, weakestKey, yearPillar, tenGod = "", luck = null, facts = {}) {
    const spot = personalAnnualSpotlight(facts.year, facts.chart || {});
    if (spot) return spot.caution;
    const evidence = facts.evidence || {};
    if (evidence.strongTrigger) return `${evidence.strongTrigger.label}同时动到${evidence.strongTrigger.axis}。强触发只表示改动集中，不表示灾祸；重大决定拆开执行，每一步都保留合同、现金和退出余地。`;
    if (evidence.void && evidence.void.active) return `${yearPillar}落日柱旬空${evidence.void.filled ? "且已有填实信号，事情多半先虚后实" : "，表面机会与实际落实可能不同步"}。职位看任命与验收，钱看到账，关系看行动，身体看正规记录。`;
    if (evidence.control && ["hurting-meets-officer", "resource-controls-hurting", "food-controls-kill"].includes(evidence.control.key)) return `${evidence.control.label}决定这一年的问题怎样处理：${evidence.control.text} ${tenGod}带来的机会和压力都要放进来。`;
    if (facts.luckRelations && facts.luckRelations.branch.clashes.length) return `${yearPillar}冲到${luck.ganZhi}大运支，变化可以有，但别把工作、住处、投资和关系同时推翻。先处理最确定的一项，再看下一项。`;
    if (relations.completedPunishments.length || relations.clashes.length) return `${yearPillar}有冲刑，说明调整和多线压力集中，不代表灾祸。先把受动柱对应的现实事项找出来，不在最忙乱时同时改工作、钱和关系。`;
    if (relations.harms.length || relations.breaks.length) return `${yearPillar}的害破更怕条件暗改和兑现不足。合同、回款、时间与责任都要二次确认，发现偏差就重谈，不把小问题拖成长期消耗。`;
    return `${yearPillar}没有强冲刑对应所谓“大事件”，便看${tenGod}和岁支藏干在生活里怎样表现。年中回看交付、账目、相处和健康情况，再修正最初看法。`;
  }

  function baziAnnualActions(focus, weakest, stage, relations, facts = {}) {
    const spot = personalAnnualSpotlight(facts.year, facts.chart || {});
    if (spot) return spot.actions;
    const first = ({
      比肩: "确定一项必须由自己负责到底的成果，其余合作先写职责、署名和决定权。",
      劫财: "所有共同投入先写分账、预算上限和退出方式，人情不能代替规则。",
      食神: "完成一项可展示、可验收、可复用的作品，再用真实反馈决定是否扩大。",
      伤官: "把改进意见整理成事实、证据和替代方案，进入正式流程后再公开表达。",
      偏财: "外部机会按最慢回款和最坏退出做测算，只保留净收益成立的项目。",
      正财: "把固定收入、长期合同、成本和税费逐项列清，先稳现金流再扩责任。",
      七杀: "接高压任务前确认权限、资源、验收标准和恢复时间，缺一项就降载。",
      正官: "把职位、证书、合同或长期责任落成正式文件，不靠默认名分。",
      偏印: "给研究和转型设截止日期，学到的东西必须落成方法、项目或岗位。",
      正印: "把经验沉淀成标准流程或正式资质，同时删掉一项只准备不行动的事务。"
    })[facts.tenGod] || "只确定一项年度主任务，并用实际结果决定是否继续。";
    const mainMove = facts.evidence && facts.evidence.moves && facts.evidence.moves[0];
    const second = mainMove
      ? `${mainMove.label}${({ clash: "受冲", harmony: "被合", harm: "见害", break: "见破", repeat: "伏动", punishment: "见刑" })[mainMove.type] || "受动"}，针对${mainMove.axis}单独做一份备选方案和责任清单。`
      : `把${dependencies().annualDomainLabel(weakest)}的现实记录保留到年中，再决定是否调整原计划。`;
    const third = facts.evidence && facts.evidence.void.active ? "所有重要事项用任命、合同、验收、到账或持续行动填实，不凭意向加码。"
      : facts.luckRelations && facts.luckRelations.phase === "opening" ? `新入${facts.luck.ganZhi}大运，先用一年验证方向，不急着给未来十年下结论。`
        : relations.clashes.length || relations.completedPunishments.length ? "把变化拆成两到三步，前一项稳定后再启动下一项。"
          : `${facts.yearPillar}年中按${stage.label}的现实任务复盘一次，年底只保留有结果的做法。`;
    return [first, second, third];
  }

  function baziAnnualBasis(yearPillar, stemElement, branchElement, pillars, relations, context = {}, luck = null, tenGod = "", extra = {}) {
    const luckText = luck && luck.ganZhi ? `${luck.ganZhi}大运（${luck.startYear}-${luck.endYear}）` : "起运前阶段";
    const evidence = extra.evidence || {};
    const root = evidence.stemRoot
      ? `${evidence.stemRoot.stem}${evidence.stemRoot.level === "足" ? "根气较足" : evidence.stemRoot.level === "有承接" ? "根气不弱" : evidence.stemRoot.level === "浅" ? "根气偏浅" : "无根"}`
      : "根气待查";
    const hidden = hiddenGodText(evidence.annualHidden || []) || "藏干待查";
    const moveText = (evidence.moves || []).slice(0, 4).map((item) => `${item.label}${({ clash: "冲", harmony: "合", harm: "害", break: "破", repeat: "伏动", punishment: "刑" })[item.type] || "动"}`).join("、") || "无强冲合";
    const special = [evidence.control && evidence.control.label, evidence.strongTrigger && evidence.strongTrigger.label, evidence.void && evidence.void.active ? `日柱旬空${evidence.void.filled ? "有填实" : "待落实"}` : ""].filter(Boolean).join("、") || "无额外强结构";
    const domains = extra.age < 18 ? "学习与能力、家庭资源、亲子同伴和健康记录" : "事业、钱、关系和身体";
    const year = Number(extra.year) || 0;
    const variant = mod((year || cycle.indexOf(yearPillar)) + Math.floor(year / 12), 12);
    const sentences = [
      `${year}年的${yearPillar}要放回${luckText}看：岁干为${tenGod}，岁支藏${hidden}，${root}；原局和大运另见${moveText}、${special}，落到生活里主要是${domains}。`,
      `${year}仍属${luckText}，${yearPillar}的岁干为${tenGod}，岁支藏${hidden}，${root}；连同${moveText}与${special}，再分辨${domains}中哪一处动得较深。`,
      `${luckText}管较长的背景，${year}的${yearPillar}管当年的起伏。岁干${tenGod}、岁支藏${hidden}，并见${root}；${moveText}和${special}补充说明${domains}的变化来源。`,
      `${luckText}先交代${year}所处阶段，再看${yearPillar}${tenGod}与岁支所藏${hidden}。${root}交代岁干有没有根，${moveText}与${special}则把变化带到${domains}。`,
      `${year}先看${luckText}，再看${yearPillar}：岁干为${tenGod}，岁支藏${hidden}，${root}；${moveText}和${special}对应${domains}里的具体事情。`,
      `${year}的${yearPillar}离不开${luckText}，岁干${tenGod}，岁支藏${hidden}，${root}；结合${moveText}与${special}，主要看${domains}里发生了什么变化。`,
      `${year}的命盘信息分成两处：${luckText}中的${yearPillar}、岁干${tenGod}、岁支藏${hidden}和${root}，以及${moveText}、${special}。它们共同指向${domains}。`,
      `${year}以${luckText}为背景，再看${yearPillar}的岁干${tenGod}、岁支藏${hidden}与${root}；${moveText}和${special}会先带动${domains}中的部分事情。`,
      `${year}把十神放进完整结构才有意义：${yearPillar}的岁干为${tenGod}，岁支藏${hidden}，${root}；连同${luckText}、${moveText}和${special}，再看${domains}。`,
      `${year}回看${luckText}和${yearPillar}时，岁干${tenGod}、岁支藏${hidden}与${root}先交代力量来源，${moveText}和${special}再指向${domains}中更值得留意的部分。`,
      `${yearPillar}说明${year}的当年气象，${luckText}说明较长阶段。岁干${tenGod}、岁支藏${hidden}，${root}交代力量来源；${moveText}和${special}对应${domains}中的变化。`,
      `${year}从${luckText}读到${yearPillar}：岁干${tenGod}，岁支藏${hidden}，${root}；再看${moveText}和${special}有没有对应经历，事情仍落在${domains}。`
    ];
    return sentences[variant];
  }

  function crossMethodSynthesis(evidence, facts) {
    if (!evidence) return "这里只按八字时序解释，手相和面相没有逐年计时能力。";
    const changing = facts.relations.clashes.length || facts.relations.completedPunishments.length || (facts.luckRelations && facts.luckRelations.branch.clashes.length);
    const family = tenGodFamily(facts.tenGod);
    const annualEvidence = facts.evidence || {};
    const spot = personalAnnualSpotlight(facts.year, facts.chart || {});
    const timing = annualEvidence.strongTrigger ? annualEvidence.strongTrigger.label
      : annualEvidence.control ? annualEvidence.control.label
        : annualEvidence.moves && annualEvidence.moves.length ? `${annualEvidence.moves[0].label}${({ clash: "冲", harmony: "合", harm: "害", break: "破", repeat: "伏动", punishment: "刑" })[annualEvidence.moves[0].type] || "受动"}`
          : facts.annualStructure.label;
    const headline = spot && spot.headline ? spot.headline : `${timing}会怎样落到生活里`;
    const focusLabel = spot && spot.labels && spot.labels[facts.focusKey]
      ? spot.labels[facts.focusKey]
      : dependencies().annualDomainLabel(facts.focusKey);
    const weakLabel = spot && spot.labels && spot.labels[facts.weakestKey]
      ? spot.labels[facts.weakestKey]
      : dependencies().annualDomainLabel(facts.weakestKey);
    const cycleText = facts.luck && facts.luck.ganZhi ? `${facts.luck.ganZhi}大运` : "起运前阶段";
    const variant = mod((Number(facts.year) || 0) + Math.floor((Number(facts.year) || 0) / 12), 12);
    if (facts.age < 18) {
      const youthRecords = facts.age < 6
        ? "家庭相册、接种与就医记录、居住和照护变化"
        : facts.age < 12
          ? "学籍、作业、奖惩记录、家庭相册和同期就医资料"
          : "成绩单、作品、活动记录、同学往来和同期健康资料";
      const youthLeads = [
        `${facts.year}从${cycleText}和${facts.yearPillar}${facts.tenGod}起笔，最值得回看的是：${headline}`,
        `${facts.year}处在${cycleText}，${facts.yearPillar}${facts.tenGod}把注意力带到：${headline}`,
        `${facts.year}先看${cycleText}，再看${facts.yearPillar}${facts.tenGod}，两处都指向：${headline}`,
        `${facts.yearPillar}${facts.tenGod}放进${cycleText}后，${facts.year}留下的传统提示是：${headline}`,
        `${cycleText}说明${facts.year}处在哪个阶段，${facts.yearPillar}${facts.tenGod}则把问题带到：${headline}`,
        `${facts.year}仍在${cycleText}里，${facts.yearPillar}${facts.tenGod}提醒回看：${headline}`,
        `${facts.year}的传统时序落在${cycleText}中的${facts.yearPillar}${facts.tenGod}，可回看：${headline}`,
        `把${facts.yearPillar}${facts.tenGod}放回${cycleText}，${facts.year}最该翻一翻的是：${headline}`,
        `${facts.year}把${cycleText}和${facts.yearPillar}${facts.tenGod}合起来看，问题落在：${headline}`,
        `${cycleText}交代${facts.year}的前后阶段，${facts.yearPillar}${facts.tenGod}再把注意力带到：${headline}`,
        `${cycleText}与${facts.yearPillar}${facts.tenGod}构成${facts.year}的传统背景，值得回看的是：${headline}`,
        `${facts.year}顺着${cycleText}读到${facts.yearPillar}${facts.tenGod}，先看：${headline}`
      ];
      const youthPalm = [
        `成年手掌照片拍得更晚，“${focusLabel}”只能回看${facts.year}的材料`,
        `手相停在成年掌照，${facts.year}有没有“${focusLabel}”要翻同期资料`,
        `${facts.year}的童年经历以当时资料为准，当前掌纹只说明成年状态`,
        `成年掌照与${facts.year}相隔多年，“${focusLabel}”另查当年的学习和家庭资料`,
        `手掌照片记的是成年状态，${facts.year}的“${focusLabel}”仍要另找材料`,
        `${facts.year}和成年掌照不在同一时点：掌纹归成年，“${focusLabel}”归童年档案`,
        `当前两掌只作成年参照，${facts.year}的“${focusLabel}”回到旧资料里看`,
        `掌照保留当前可见形态，${facts.year}有没有“${focusLabel}”仍看当时材料`,
        `${facts.year}处在${facts.stage.label}，成年掌照与“${focusLabel}”分开理解`,
        `两张掌照拍于成年后，${facts.year}的“${focusLabel}”还得翻旧档案`,
        `掌纹说明当前可见形态，${facts.year}的“${focusLabel}”交给同期材料`,
        `${facts.year}有没有“${focusLabel}”仍是档案问题，成年手掌只说明拍摄时状态`
      ][variant];
      const youthFace = [
        `成年面照只记拍摄当下，“${weakLabel}”另看当年状态`,
        `面相照片只说明当前外观，与${facts.year}的“${weakLabel}”没有时间对应`,
        `${facts.year}的“${weakLabel}”要看同期资料，现在的脸部比例只记当前`,
        `当前面照停在拍摄时点，${facts.year}的“${weakLabel}”回到旧档案`,
        `面部照片拍在成年后，“${weakLabel}”仍缺同期影像`,
        `成年面相保留拍摄时外观，${facts.year}的“${weakLabel}”还要另查`,
        `现在的下巴、唇带和脸型归当前照片，${facts.year}的“${weakLabel}”归同期记录`,
        `${facts.year}的“${weakLabel}”与成年面照分开看`,
        `面照止于当前比例，${facts.year}的“${weakLabel}”要由当期资料回答`,
        `当前脸部外观与童年事件分开保存，“${weakLabel}”只查当期资料`,
        `${facts.year}把成年面部特征与“${weakLabel}”分成两类证据`,
        `成年面照的时点在童年之后，没有同期材料时，${facts.year}的“${weakLabel}”仍是未知`
      ][mod(variant + 5, 12)];
      const youthReality = [
        `最后翻${youthRecords}，看“${focusLabel}”有没有发生，“${weakLabel}”后来怎样处理`,
        `${youthRecords}最接近${facts.year}的真实情况，“${focusLabel}”与“${weakLabel}”分开看`,
        `${facts.year}以${youthRecords}为准，资料没有写到的事就保持未知`,
        `先找${youthRecords}，再分别回答“${focusLabel}”和“${weakLabel}”`,
        `只有${youthRecords}能说明${facts.year}；两项标题都要找到同期依据`,
        `${youthRecords}能对上的部分才写入${facts.year}，其余不补剧情`,
        `回看${facts.year}，先从${youthRecords}找“${focusLabel}”和“${weakLabel}”的痕迹`,
        `${youthRecords}比后来印象更可靠，可分别说明“${focusLabel}”和“${weakLabel}”`,
        `${facts.year}先翻${youthRecords}，再看两项标题有没有连续材料`,
        `${youthRecords}用来回答${facts.year}的问题，单次印象说明不了“${focusLabel}”或“${weakLabel}”`,
        `档案里找到${youthRecords}才往下分析，找不到就停在传统提示`,
        `${facts.year}最终回到${youthRecords}，先把事实弄清，再谈“${focusLabel}”与“${weakLabel}”`
      ][mod(variant + 8, 12)];
      return `${youthLeads[variant]}。${youthPalm}；${youthFace}。${youthReality}。`;
    }
    const palmAnchor = ({
      peer: "命运线并非深直贯通",
      output: "太阳线偏浅、智慧线较长",
      wealth: "财运纹浅而交叉",
      officer: "命运线在智慧线附近受交叉",
      resource: "智慧线长，贵人线仍待确认"
    })[family] || "三大主线可见，辅助纹较浅";
    const palmMethod = ({
      peer: `共同做事时，职责和成果能否分清，“${focusLabel}”有没有做成`,
      output: `作品有没有完成、被采用，并且还能继续产出，“${focusLabel}”是否由此做成`,
      wealth: `合同金额、实际成本、到账和净留存是否算清，“${focusLabel}”带来的钱最后留下多少`,
      officer: `职位是否配有权限、人手和休息时间，“${focusLabel}”是否值得承担`,
      resource: `学习或转型是否有期限，最后有没有换成项目、岗位或资质`
    })[family] || `连续行动是否带来“${focusLabel}”所说的变化`;
    const palmClauses = [
      `${facts.year}引用的成年掌照可见“${palmAnchor}”，这里只作做事习惯的参照：${palmMethod}`,
      `${facts.year}引用的两掌实照中，“${palmAnchor}”属于成年状态；当年主要观察${palmMethod}`,
      `${facts.year}不能由掌照里的“${palmAnchor}”计时，只能拿它比较做事方式：${palmMethod}`,
      `${facts.year}引用的掌纹观察是成年照片中的“${palmAnchor}”；生活里可看${palmMethod}`,
      `${facts.year}参考的两张手相照片显示“${palmAnchor}”，它只说明长期习惯，当年要看${palmMethod}`,
      `成年掌纹可见“${palmAnchor}”，照片和${facts.year}分开计时；当年可观察${palmMethod}`,
      `${facts.year}仍从同一组掌照保留“${palmAnchor}”这项观察，只借它比较${palmMethod}`,
      `${facts.year}仍以成年掌照中的“${palmAnchor}”作长期参照，具体看${palmMethod}`,
      `${facts.year}沿用现有手相中的“${palmAnchor}”，但纹路只说明成年基线，当年仍要看${palmMethod}`,
      `${facts.year}的手相部分只提供照片中的“${palmAnchor}”，具体要看${palmMethod}`,
      `${facts.year}引用的成年掌照支持“${palmAnchor}”这条观察，有没有对应变化，要看${palmMethod}`,
      `${facts.year}的掌纹部分止于成年照片所见“${palmAnchor}”，当年的事则看${palmMethod}`
    ];
    const faceObservation = ({
      peer: "下颏偏圆、唇形有厚度",
      output: "眉眼和口唇的拍摄时外观",
      wealth: "唇带与下巴承托比例",
      officer: "下颏偏圆且有软组织承托",
      resource: "当前下庭承托"
    })[family] || "当前脸部比例";
    const faceDenied = ({
      peer: "同辈竞争、分账或人际结果",
      output: "作品名声、表达成败或曝光高低",
      wealth: "收入、婚期或资产变化",
      officer: "职位升降或健康结果",
      resource: "学业、贵人或平台结果"
    })[family] || "单年吉凶";
    const faceClauses = [
      `${facts.year}引用的面照能确认${faceObservation}，但照片时点止于当前；至于${faceDenied}与“${weakLabel}”，另查当年情况`,
      `${facts.year}的面相所见${faceObservation}只属于当前外观，生活中的${faceDenied}与“${weakLabel}”仍要看当年经历`,
      `${facts.year}从当前面照可以谈${faceObservation}，却看不出当年的${faceDenied}，“${weakLabel}”仍按生活情况为准`,
      `${facts.year}的面相只保留${faceObservation}这项照片事实，${faceDenied}与“${weakLabel}”分别交给当年经历`,
      `${facts.year}引用面照中的${faceObservation}时，照片负责外观；${faceDenied}与“${weakLabel}”仍按当时材料判断`,
      `${facts.year}引用的脸部照片记下${faceObservation}和拍摄当下，${faceDenied}与“${weakLabel}”另看同期材料`,
      `${facts.year}的面照只说明${faceObservation}，${faceDenied}与“${weakLabel}”回到当时生活里看`,
      `${facts.year}的面相部分只描述${faceObservation}，${faceDenied}与“${weakLabel}”留给当年经历`,
      `${facts.year}引用现有面部比例来说明${faceObservation}，两项生活问题各按当时材料处理`,
      `${facts.year}的面照依据停在${faceObservation}；当年的${faceDenied}与“${weakLabel}”都要另查`,
      `${facts.year}只能从面照看${faceObservation}，至于${faceDenied}和“${weakLabel}”，要看当时发生了什么`,
      `${facts.year}引用的当前照片里，${faceObservation}属于拍摄时外观，${faceDenied}与“${weakLabel}”分开看`
    ];
    const realityCheck = ({
      peer: "职责是否说清、成果归谁、合作能否体面退出",
      output: "作品有没有完成和被采用、回款是否到账、产出能否继续",
      wealth: "合同写了什么、钱何时到账、扣掉成本还剩多少",
      officer: "任命是否正式、权限是否够用、忙完能否恢复",
      resource: "学到的东西是否用进项目、资质或新的岗位"
    })[family] || "事情有没有做完、钱有没有留下、关系能否持续、身体是否吃得消";
    const closings = [
      `${facts.year}到了年底，直接看${realityCheck}；“${focusLabel}”有进展，也要算清“${weakLabel}”付出了什么代价`,
      `${facts.year}的得失不靠总分，先看${realityCheck}，再看“${focusLabel}”与“${weakLabel}”能否同时维持`,
      `${facts.year}要看${realityCheck}，“${focusLabel}”若只维持很短，“${weakLabel}”却一直变差，就该调整`,
      `${facts.year}把${realityCheck}弄清楚，便知道“${focusLabel}”做成多少、“${weakLabel}”有没有拖累日常`,
      `${facts.year}先看${realityCheck}；“${focusLabel}”做成了，“${weakLabel}”也守得住，进展才扎实`,
      `${facts.year}年中和年底各看一次${realityCheck}，既看“${focusLabel}”走了多远，也留意“${weakLabel}”有没有被挤掉`,
      `${facts.year}不看笼统总分，直接算${realityCheck}；“${focusLabel}”和“${weakLabel}”分开看会更清楚`,
      `${facts.year}看的是${realityCheck}；若“${weakLabel}”不断变差，“${focusLabel}”的短期成绩就不值得硬撑`,
      `${facts.year}最后看${realityCheck}，“${focusLabel}”有所收获却让“${weakLabel}”明显失守，代价就偏高`,
      `${facts.year}看完${realityCheck}再问两件事：“${focusLabel}”有没有做成，“${weakLabel}”是否长期受损`,
      `${facts.year}先把${realityCheck}说清，再比较“${focusLabel}”和“${weakLabel}”，少凭一时感觉下结论`,
      `${facts.year}以${realityCheck}为准；“${focusLabel}”若靠长期牺牲“${weakLabel}”换来，这条路就该重估`
    ];
    const lead = facts.luckRelations && facts.luckRelations.phase === "opening"
      ? `${facts.year}正逢${cycleText}起步，${facts.yearPillar}${facts.tenGod}借${timing}分清新旧阶段，关心的是：${headline}`
      : facts.luckRelations && facts.luckRelations.phase === "closing"
        ? `${facts.year}走到${cycleText}收尾，${facts.yearPillar}${facts.tenGod}借${timing}看哪些责任还值得保留，关心的是：${headline}`
        : changing
          ? `${facts.year}在${cycleText}里出现${timing}，${facts.yearPillar}${facts.tenGod}把变化带到：${headline}`
          : `${facts.year}仍在${cycleText}中，${facts.yearPillar}${facts.tenGod}经由${timing}带出：${headline}`;
    return `${lead}。${palmClauses[variant]}。${faceClauses[mod(variant + 4, 12)]}。${closings[mod(variant + 7, 12)]}。`;
  }

  function yearlyTheme(branch, pillars, age = 18) {
    const yearElement = elementOf(branch);
    const base = (age < 18 ? {
      木: "学习拓展、同伴互动与新兴趣",
      火: "表达、考试、作品与被看见",
      土: "日常稳定、家庭支持与长期习惯",
      金: "规则、方法、技能与执行",
      水: "信息、迁移、适应与复盘"
    } : {
      木: "学习、扩张、人脉和新项目",
      火: "曝光、表达、考试、作品和名声",
      土: "稳定、责任、资产、家宅和长期结构",
      金: "规则、证书、职位、技术和执行",
      水: "流动、信息、迁移、情绪和复盘"
    })[yearElement] || "调整";
    if (pillars.year.includes(branch) || pillars.month.includes(branch)) {
      return `${base}被放大，宜主动整理旧问题`;
    }
    return base;
  }

  function isValidDayPillar(value) {
    return cycle.includes(String(value || ""));
  }

  function formatDateTime(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  const api = Object.freeze({
    version: 4,
    providerVersion: "lazy_bazi_runtime_v4",
    configure,
    estimatePillars,
    buildChartContext,
    elementText,
    baziTimeline,
    baziTimelineYear,
    baziTimelineProvider,
    baziBranchRelations,
    isValidDayPillar,
    formatDateTime
  });

  global.PalmFaceBaziRuntime = api;
})(window);
