(function () {
  "use strict";

  const sourceRegistry = window.PalmFaceSourceRegistry || null;
  const publicStaticMode = window.PalmFacePublicStatic === true;
  const personalProfileSeed = publicStaticMode ? null : (window.PalmFacePersonalProfile || null);
  const appBootStartedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;

  let traditionalRules = null;
  let traditionalRulesPromise = null;

  function rulesFor(mode) {
    return traditionalRules && traditionalRules[mode] ? traditionalRules[mode] : {};
  }

  function specsFor(mode) {
    return traditionalRules ? traditionalRules[`${mode}Specs`] || [] : [];
  }

  function ensureTraditionalRules() {
    if (traditionalRules) return Promise.resolve(traditionalRules);
    if (!traditionalRulesPromise) {
      traditionalRulesPromise = import("./traditional-rules.js?v=20260724.3")
        .then((module) => {
          traditionalRules = module.default;
          return traditionalRules;
        })
        .catch((error) => {
          traditionalRulesPromise = null;
          throw error;
        });
    }
    return traditionalRulesPromise;
  }

  function awaitTraditionalRules(mode, node) {
    if (traditionalRules) return false;
    setHtml(node, "<p>载入解释依据…</p>");
    ensureTraditionalRules()
      .then(mode === "palm" ? renderPalmReport : renderFaceReport)
      .catch((error) => setHtml(node, `<p class="muted">依据载入失败：${escapeHtml(shortError(error))}</p>`));
    return true;
  }

  const state = {
    palmImage: null,
    palmMetrics: null,
    palmSamples: [],
    faceImage: null,
    faceMetrics: null,
    faceSamples: [],
    universalRoutes: [],
    routeCalibration: null,
    manualRegions: {
      palm: new Set(),
      face: new Set()
    },
    shotGuides: {
      palm: null,
      face: null
    },
    modelRegions: {
      palm: new Set(),
      face: new Set()
    },
    palmStream: null,
    faceStream: null,
    caseLibrary: [],
    caseLibraryIndex: [],
    caseLibraryTotalCount: 0,
    caseLibraryFullyLoaded: true,
    caseLibraryLoadPromise: null,
    caseLibraryPagePromise: null,
    caseLibraryBackgroundScheduled: false,
    caseLibraryBackgroundDirty: false,
    caseAssetLoadPromise: null,
    caseAssetHydrationScheduled: false,
    caseAssetsLoaded: new Set(),
    caseAssetsRequested: new Set(),
    caseLibraryPersistPromise: null,
    caseLibraryPersistRequested: false,
    caseSavePromise: Promise.resolve(),
    caseIdSequence: 0,
    caseStorage: {
      backend: "pending",
      status: "idle",
      migrated: false,
      caseCount: 0,
      loadedCaseCount: 0,
      fullyLoaded: true,
      pageSize: 40,
      indexCount: 0,
      assetCount: 0,
      hydratedAssetCount: 0,
      imageStoreSeparate: false,
      error: ""
    },
    geometryTrainingLibrary: [],
    geometryTrainingLibraryLoaded: false,
    geometryTrainingLibraryScheduled: false,
    importedModelResults: [],
    modelEndpointConfig: {
      url: "",
      mode: "auto"
    },
    modelEndpointBusy: {
      palm: false,
      face: false
    },
    modelRecognitionQueues: {
      palm: Promise.resolve(),
      face: Promise.resolve()
    },
    modelRecognitionCache: new Map(),
    modelRecognitionCacheStats: {
      hits: 0,
      misses: 0,
      staleDiscards: 0
    },
    modelEndpointLastStatus: "端点未配置",
    runtimePerformance: {
      initializationMs: null,
      longTaskCount: 0,
      longTaskTotalMs: 0,
      maximumLongTaskMs: 0,
      observerSupported: false,
      observedAt: null
    },
    imageDecodeFailures: [],
    geometryOverlay: {
      palm: { guide: true, model: true, edit: false },
      face: { guide: true, model: true, edit: false }
    },
    geometryCorrections: {
      palm: [],
      face: []
    },
    previewBaseCanvases: {
      palm: null,
      face: null
    },
    activeGeometryDrag: null,
    faceHairlineCalibrationSampleId: null,
    creaseReconnectSelection: [],
    creaseEditorNotice: "",
    geometryTrainingFilters: {
      mode: "all",
      source: "all",
      reviewStatus: "all",
      targetKind: "all"
    },
    caseLibraryVisibleCount: 24,
    timelineViews: {
      palm: null,
      bazi: null
    },
    renderedReports: { palm: false, face: false, bazi: false },
    personalProfileData: null,
    personalProfileDataPromise: null,
    personalProfileBusyMode: "",
    personalMasterSeedPromise: null,
    personalMasterSeedScheduled: false
  };

  const caseStorageKey = "palmFaceBaziCases.v1";
  const caseIndexStorageKey = "palmFaceBaziCaseIndex.v2";
  const caseMigrationStorageKey = "palmFaceBaziCaseMigration.v1";
  const geometryTrainingStorageKey = "palmFaceBaziGeometryTraining.v1";
  const modelEndpointStorageKey = "palmFaceBaziModelEndpoint.v1";
  const routeCalibrationStorageKey = "palmFaceBaziRouteCalibration.v1";
  const personalProfileModes = ["palm", "face", "bazi"];
  const defaultModelEndpointUrl = publicStaticMode ? "" : "/api/recognize";
  const defaultModelEndpointMode = publicStaticMode ? "off" : "auto";
  const shotGuideMinimumQuality = 0.48;
  const shotGuideHighQuality = 0.64;
  const caseThumbnailMaxSide = 144;
  const caseThumbnailQuality = 0.66;
  const recognitionImageMaxSide = 1600;
  const recognitionImageQuality = 0.82;
  const imageUploadMaxBytes = 32 * 1024 * 1024;
  let imageDecodeRuntimePromise = null;
  let baziRuntimePromise = null;
  let baziRuntimeStatus = "idle";
  let baziRuntimeError = "";
  const modelRecognitionCacheLimit = 6;
  const caseLibraryMaxCases = 200;
  const caseLibraryInitialHydrationLimit = 80;
  const caseLibraryPageSize = 40;
  const caseLibraryInitialRenderLimit = 24;
  const caseLibraryRenderStep = 24;
  const caseThumbnailRenderLimit = 3;
  const caseThumbnailPersistenceLimit = 48;
  const similarCaseScanLimit = 80;
  const geometryTrainingRenderLimit = 12;
  const detailedTimelinePageSize = 6;
  const faceProportionSampleScanLimit = 32;
  const faceProportionThresholds = Object.freeze({
    lowerCourtShortIndex: 0.88,
    lowerCourtLongIndex: 1.12,
    chinSupportShortRatio: 0.34,
    chinSupportLongRatio: 0.55,
    prominentLipBandRatio: 0.22,
    minimumVerifiedPointConfidence: 0.55,
    minimumImageQuality: 0.5,
    minimumNativeFaceCaptureQuality: 0.5,
    minimumOrientationConfidence: 0.5,
    subjectClipMargin: 0.008
  });
  const derivedDataCache = {
    revision: 0,
    geometryDatasetRevision: -1,
    geometryDataset: null,
    geometryProfiles: new Map(),
    creaseCalibrationRevision: -1,
    creaseCalibration: null
  };
  const caseStorageAdapter = window.PalmFaceCaseStorage
    ? window.PalmFaceCaseStorage.create({
        dbName: "palmFaceBaziSite",
        dbVersion: 3,
        storeName: "cases",
        assetStoreName: "caseAssets",
        legacyKey: caseStorageKey,
        indexKey: caseIndexStorageKey,
        migrationKey: caseMigrationStorageKey,
        maxCases: caseLibraryMaxCases,
        initialCaseLimit: caseLibraryInitialHydrationLimit
      })
    : null;
  const caseEvidenceRuntime=window.caseEvidenceRuntime||{eligible:()=>false,matches:()=>true};
  const feedbackRatingLabels = {
    unreviewed: "待验证",
    accurate: "准确",
    partial: "部分准确",
    wrong: "不准确"
  };
  const annotationStatusLabels = {
    unknown: "未标注",
    clear: "清楚",
    deep: "深明显",
    light: "偏浅",
    broken: "断续",
    balanced: "均衡",
    weak: "偏弱",
    asymmetric: "不均",
    need_more: "待补图"
  };
  const palmSemanticRuntime=window.PalmSemanticRuntime||{catalog:[],view:()=>null,snapshot:()=>null,controls:()=>""};
  const palmCreaseSemanticCatalog=palmSemanticRuntime.catalog;
  const personalPalmRuntime=window.PersonalPalmRuntime||{build:()=>null};
  const faceObservationRuntime=window.FaceObservationRuntime||{normalize:()=>[],preserve:(_,items)=>items||[],apply:()=>({changed:false,message:""}),panel:()=>"",trainingItems:()=>[],targetLabel:()=>"",evidence:()=>""};
  const faceThirdsRuntime=window.FaceThirdsRuntime||{sanitizeKeypoints:(x)=>x||[],validPoint:()=>({valid:true}),prepareCorrection:()=>{},apply:()=>({}),review:()=>({status:"empty"}),replayable:()=>true,replaySource:()=>"manual_geometry",verifiedSource:(x)=>x==="manual_geometry",sourceCounts:()=>({manual:0,native:0,model:0,heuristic:0}),sourceLabel:()=>"",statusLabel:()=>"",verdictLabel:()=>"",thresholdSnapshot:(x)=>x,classifyLowerCourt:()=>"",classifyChinSupport:()=>"",panel:()=>""};
  const personalFaceRuntime=window.PersonalFaceRuntime||{build:()=>null};
  const personalCrossRuntime=window.PersonalCrossRuntime||{build:()=>({summary:"",sections:[],sourceRefs:[],boundaries:[],standards:{}})};
  const sampleProvenanceCatalog = [
    { value: "unconfirmed", label: "来源未确认" },
    { value: "self_owned", label: "本人自有照片" },
    { value: "consented", label: "他人明确授权" },
    { value: "public_licensed", label: "公开许可样本" },
    { value: "book_reference", label: "书籍图例仅参考" }
  ];
  const recognitionAdapter = {
    name: "heuristic-local",
    version: "heuristic-v1",
    contractVersion: 1
  };
  const semanticModelRegistry = Object.freeze([]);

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function setHtml(node, html) {
    node.innerHTML = html;
  }

  function invalidateDerivedData() {
    derivedDataCache.revision += 1;
    derivedDataCache.geometryDatasetRevision = -1;
    derivedDataCache.geometryDataset = null;
    derivedDataCache.geometryProfiles.clear();
    derivedDataCache.creaseCalibrationRevision = -1;
    derivedDataCache.creaseCalibration = null;
  }

  function runtimePerformanceSnapshot() {
    const metrics = state.runtimePerformance || {};
    const initializationMs = Number.isFinite(metrics.initializationMs) ? Math.round(metrics.initializationMs * 10) / 10 : null;
    const maximumLongTaskMs = Math.round(Number(metrics.maximumLongTaskMs || 0) * 10) / 10;
    const longTaskTotalMs = Math.round(Number(metrics.longTaskTotalMs || 0) * 10) / 10;
    const slow = Boolean((initializationMs !== null && initializationMs > 250) || maximumLongTaskMs > 200);
    return {
      status: slow ? "slow" : initializationMs === null ? "pending" : "within_budget",
      initializationMs,
      longTaskCount: Number(metrics.longTaskCount || 0),
      longTaskTotalMs,
      maximumLongTaskMs,
      observerSupported: Boolean(metrics.observerSupported),
      budgets: {
        initializationMs: 250,
        maximumLongTaskMs: 200
      },
      boundedState: {
        recognitionCacheEntries: state.modelRecognitionCache.size,
        recognitionCacheLimit: modelRecognitionCacheLimit,
        visibleCaseLimit: state.caseLibraryVisibleCount,
        geometryTrainingRenderLimit,
        hydratedCaseAssets: state.caseAssetsLoaded.size,
        caseAssetHydrationScheduled: state.caseAssetHydrationScheduled,
        caseLibraryBackgroundDirty: state.caseLibraryBackgroundDirty,
        baziRuntime: baziRuntimeSnapshot()
      },
      storesImageData: false
    };
  }

  function renderRuntimePerformanceStatus() {
    if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
    const status = $("#runtime-performance-status");
    const detail = $("#runtime-performance-detail");
    if (!status || !detail) return;
    const snapshot = runtimePerformanceSnapshot();
    status.textContent = snapshot.status === "pending"
      ? "性能待测"
      : snapshot.status === "slow"
        ? "本地性能需复核"
        : "本地性能正常";
    status.classList.toggle("strong", snapshot.status === "within_budget");
    const bootText = snapshot.initializationMs === null ? "初始化待记录" : `页面初始化 ${snapshot.initializationMs} ms`;
    const taskText = snapshot.observerSupported
      ? `长任务 ${snapshot.longTaskCount} 次 / 最长 ${snapshot.maximumLongTaskMs} ms`
      : "当前浏览器未提供长任务观察器";
    detail.textContent = `${bootText} · ${taskText} · 缓存 ${snapshot.boundedState.recognitionCacheEntries}/${snapshot.boundedState.recognitionCacheLimit} · 不保存图片`;
  }

  function initRuntimePerformanceMonitor() {
    const metrics = state.runtimePerformance;
    if (typeof PerformanceObserver === "function" && Array.isArray(PerformanceObserver.supportedEntryTypes) && PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      metrics.observerSupported = true;
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const duration = Number(entry.duration || 0);
          metrics.longTaskCount += 1;
          metrics.longTaskTotalMs += duration;
          metrics.maximumLongTaskMs = Math.max(metrics.maximumLongTaskMs, duration);
        });
        metrics.observedAt = new Date().toISOString();
        renderRuntimePerformanceStatus();
      });
      observer.observe({ type: "longtask", buffered: true });
    }
    renderRuntimePerformanceStatus();
  }

  function markRuntimeBootComplete() {
    if (typeof performance !== "undefined" && typeof performance.now === "function" && appBootStartedAt) {
      state.runtimePerformance.initializationMs = Math.max(0, performance.now() - appBootStartedAt);
    } else {
      state.runtimePerformance.initializationMs = 0;
    }
    const render = () => renderRuntimePerformanceStatus();
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(render, { timeout: 600 });
    else window.setTimeout(render, 0);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function percent(value) {
    return `${Math.round(value * 100)}%`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mod(value, base) {
    return ((value % base) + base) % base;
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function baziRuntimeHost() {
    return {
      annualStageProfile,
      strongestAnnualDomain,
      weakestAnnualDomain,
      annualTrend,
      annualDomainLabel,
      palmDomainAdvice,
      palmAnnualActions,
      createLazyTimelineProvider
    };
  }

  function currentBaziRuntime() {
    const runtime = window.PalmFaceBaziRuntime;
    if (!runtime || typeof runtime.configure !== "function") return null;
    runtime.configure(baziRuntimeHost());
    baziRuntimeStatus = "ready";
    baziRuntimeError = "";
    return runtime;
  }

  function ensureBaziRuntime() {
    const available = currentBaziRuntime();
    if (available) return Promise.resolve(available);
    if (baziRuntimePromise) return baziRuntimePromise;
    baziRuntimeStatus = "loading";
    baziRuntimeError = "";
    baziRuntimePromise = new Promise((resolve, reject) => {
      let script = null;
      const timeoutId = window.setTimeout(() => {
        if (script) script.remove();
        reject(new Error("bazi_runtime_load_timeout"));
      }, 8000);
      const load = (src, key, done) => {
        script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset[key] = "true";
        script.addEventListener("load", done, { once: true });
        script.addEventListener("error", () => reject(new Error(`${key}_load_failed`)), { once: true });
        document.head.appendChild(script);
      };
      const loadRuntime = () => load("./bazi-runtime.js?v=20260730.18", "baziRuntime", () => {
        window.clearTimeout(timeoutId);
        const runtime = currentBaziRuntime();
        if (runtime) resolve(runtime);
        else reject(new Error("bazi_runtime_contract_missing"));
      });
      const loadPersonalAnnualSeventhBatch = () =>
        load("./personal-bazi-annual-2097.js?v=20260730.3", "personalBaziAnnual2097", loadRuntime);
      const loadPersonalAnnualSixthBatch = () =>
        load("./personal-bazi-annual-2087.js?v=20260730.4", "personalBaziAnnual2087", loadPersonalAnnualSeventhBatch);
      const loadPersonalAnnualFifthBatch = () =>
        load("./personal-bazi-annual-2077.js?v=20260730.4", "personalBaziAnnual2077", loadPersonalAnnualSixthBatch);
      const loadPersonalAnnualFourthBatch = () =>
        load("./personal-bazi-annual-2067.js?v=20260730.3", "personalBaziAnnual2067", loadPersonalAnnualFifthBatch);
      const loadPersonalAnnualThirdBatch = () =>
        load("./personal-bazi-annual-2057.js?v=20260730.4", "personalBaziAnnual2057", loadPersonalAnnualFourthBatch);
      const loadPersonalAnnualContinuation = () =>
        load("./personal-bazi-annual-2047.js?v=20260730.3", "personalBaziAnnual2047", loadPersonalAnnualThirdBatch);
      const loadPersonalAnnualAdultTransitionBatch = () =>
        load("./personal-bazi-annual-2019.js?v=20260730.4", "personalBaziAnnual2019", loadPersonalAnnualContinuation);
      const loadPersonalAnnualYouthTransitionBatch = () =>
        load("./personal-bazi-annual-2013.js?v=20260730.2", "personalBaziAnnual2013", loadPersonalAnnualAdultTransitionBatch);
      const loadPersonalAnnualHistoricalSecondBatch = () =>
        load("./personal-bazi-annual-2007.js?v=20260730.4", "personalBaziAnnual2007", loadPersonalAnnualYouthTransitionBatch);
      const loadPersonalAnnualHistoricalFirstBatch = () =>
        load("./personal-bazi-annual-2001.js?v=20260730.4", "personalBaziAnnual2001", loadPersonalAnnualHistoricalSecondBatch);
      const loadPersonalAnnual = () => {
        if (window.PalmFacePersonalBaziAnnual) loadPersonalAnnualHistoricalFirstBatch();
        else load("./personal-bazi-annual.js?v=20260730.7", "personalBaziAnnual", loadPersonalAnnualHistoricalFirstBatch);
      };
      if (window.Solar) loadPersonalAnnual();
      else load("./vendor/lunar-javascript/lunar.js", "baziCalendar", loadPersonalAnnual);
    }).catch((error) => {
      baziRuntimeStatus = "error";
      baziRuntimeError = shortError(error);
      throw error;
    }).finally(() => {
      baziRuntimePromise = null;
    });
    return baziRuntimePromise;
  }

  function requireBaziRuntime() {
    const runtime = currentBaziRuntime();
    if (!runtime) throw new Error("bazi_runtime_not_loaded");
    return runtime;
  }

  function baziRuntimeSnapshot() {
    const runtime = window.PalmFaceBaziRuntime;
    return {
      status: baziRuntimeStatus,
      loaded: Boolean(runtime),
      version: Number(runtime && runtime.version || 0),
      providerVersion: runtime && runtime.providerVersion || "",
      startupScript: false,
      error: baziRuntimeError
    };
  }

  function checkedValues(id) {
    return $all(`#${id} input[type="checkbox"]:checked`).map((input) => input.value);
  }

  function initTabs() {
    $all(".mode-tab").forEach((button) => {
      button.addEventListener("click", () => {
        activateMode(button.dataset.mode);
      });
    });
  }

  function activateMode(mode) {
    $all(".mode-tab").forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    $all("[data-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.panel !== mode);
    });
    ensureModeReport(mode);
  }

  function ensureModeReport(mode) {
    if (!state.renderedReports || state.renderedReports[mode]) return;
    if (mode === "palm") renderPalmReport();
    else if (mode === "face") renderFaceReport();
    else if (mode === "bazi") renderBaziReport();
  }

  function initUploads() {
    initRouteCalibration();

    const universalUpload = $("#universal-upload");
    if (universalUpload) {
      universalUpload.addEventListener("change", async (event) => {
        await intakeUniversalFiles(event.target.files);
        event.target.value = "";
      });
    }

    const universalRoutes = $("#universal-routes");
    if (universalRoutes) {
      universalRoutes.addEventListener("click", async (event) => {
        const correctButton = event.target.closest("[data-correct-route-id]");
        if (correctButton) {
          await correctUniversalRoute(correctButton.dataset.correctRouteId, correctButton.dataset.correctRouteMode);
          return;
        }
        const button = event.target.closest("[data-open-route-mode]");
        if (button) activateMode(button.dataset.openRouteMode);
      });
    }

    const resetCalibration = $("#reset-route-calibration");
    if (resetCalibration) {
      resetCalibration.addEventListener("click", () => {
        resetRouteCalibration();
      });
    }

    document.addEventListener("change", (event) => {
      const provenanceInput = event.target.closest("[data-sample-provenance-field]");
      if (provenanceInput) {
        updateSampleProvenance(
          provenanceInput.dataset.sampleProvenanceMode,
          provenanceInput.dataset.sampleProvenanceId,
          provenanceInput.dataset.sampleProvenanceField,
          provenanceInput.value
        );
        return;
      }
      const input = event.target.closest("[data-correct-sample-type-id]");
      if (!input) return;
      correctSampleType(input.dataset.correctSampleTypeMode, input.dataset.correctSampleTypeId, input.value);
    });

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode-mismatch-open]");
      if (!button) return;
      const targetMode = button.dataset.modeMismatchOpen;
      if (!["palm", "face"].includes(targetMode)) return;
      activateMode(targetMode);
      const status = $(targetMode === "palm" ? "#palm-status" : "#face-status");
      if (status) status.textContent = `请在${routeModeLabel(targetMode)}入口重新上传该图，系统将按正确类别识别`;
    });

    $("#palm-upload").addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      const addedSamples = [];
      let lastSample = null;
      for (const file of files) {
        const result = await loadImageToCanvas(file, $("#palm-canvas"), $("#palm-empty"));
        if (!result) continue;
        state.palmImage = result;
        const metrics = analyzeImage(result.canvas, "palm");
        const sample = addSample("palm", file.name, $("#palm-photo-type").value, metrics);
        sample.imageDecode = result.imageDecode || null;
        lastSample = sample;
        setPreviewBaseCanvas("palm", result.canvas);
        updateSampleThumbnail(sample, result.canvas, "upload");
        captureSampleRecognitionImage(sample, result.canvas, "upload");
        await preferOriginalRecognitionImage(sample, file);
        addedSamples.push(sample);
        drawRecognitionOverlay(result.canvas, "palm", sample.metrics, sample.type, sample.modelResult);
        renderOverlaySummary("palm", sample);
      }
      await maybeAutoCallModelEndpoint("palm", addedSamples, { deferRefresh: true });
      refreshModeAfterModelBatch("palm");
      if (!completeShotGuideCapture("palm", lastSample)) {
        $("#palm-status").textContent = imageUploadStatusSummary(addedSamples.length, files.length - addedSamples.length, addedSamples);
      }
    });

    $("#face-upload").addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      const addedSamples = [];
      let lastSample = null;
      for (const file of files) {
        const result = await loadImageToCanvas(file, $("#face-canvas"), $("#face-empty"));
        if (!result) continue;
        state.faceImage = result;
        const metrics = analyzeImage(result.canvas, "face");
        const sample = addSample("face", file.name, $("#face-photo-type").value, metrics);
        sample.imageDecode = result.imageDecode || null;
        lastSample = sample;
        setPreviewBaseCanvas("face", result.canvas);
        updateSampleThumbnail(sample, result.canvas, "upload");
        captureSampleRecognitionImage(sample, result.canvas, "upload");
        await preferOriginalRecognitionImage(sample, file);
        addedSamples.push(sample);
        drawRecognitionOverlay(result.canvas, "face", sample.metrics, sample.type, sample.modelResult);
        renderOverlaySummary("face", sample);
      }
      await maybeAutoCallModelEndpoint("face", addedSamples, { deferRefresh: true });
      refreshModeAfterModelBatch("face");
      if (!completeShotGuideCapture("face", lastSample)) {
        $("#face-status").textContent = imageUploadStatusSummary(addedSamples.length, files.length - addedSamples.length, addedSamples);
      }
    });
  }

  function initRouteCalibration() {
    state.routeCalibration = loadRouteCalibration();
    renderRouteCalibrationSummary();
  }

  function defaultRouteCalibration() {
    return {
      version: 1,
      palmBias: 0,
      faceBias: 0,
      totalCorrections: 0,
      palmToFace: 0,
      faceToPalm: 0,
      typeCorrections: { palm: {}, face: {} },
      typeSamples: [],
      updatedAt: null,
      samples: []
    };
  }

  function loadRouteCalibration() {
    try {
      return normalizeRouteCalibration(JSON.parse(localStorage.getItem(routeCalibrationStorageKey) || "{}"));
    } catch (error) {
      return defaultRouteCalibration();
    }
  }

  function normalizeRouteCalibration(value) {
    const base = defaultRouteCalibration();
    if (!value || typeof value !== "object") return base;
    return {
      ...base,
      version: 1,
      palmBias: roundMetric(clamp(Number(value.palmBias || 0), -0.16, 0.16)),
      faceBias: roundMetric(clamp(Number(value.faceBias || 0), -0.16, 0.16)),
      totalCorrections: Math.max(0, Number(value.totalCorrections || 0)),
      palmToFace: Math.max(0, Number(value.palmToFace || 0)),
      faceToPalm: Math.max(0, Number(value.faceToPalm || 0)),
      typeCorrections: normalizeTypeCorrections(value.typeCorrections),
      typeSamples: Array.isArray(value.typeSamples) ? value.typeSamples.slice(0, 80) : [],
      updatedAt: value.updatedAt || null,
      samples: Array.isArray(value.samples) ? value.samples.slice(0, 40) : []
    };
  }

  function normalizeTypeCorrections(value) {
    const normalized = { palm: {}, face: {} };
    ["palm", "face"].forEach((mode) => {
      const source = value && typeof value === "object" && value[mode] && typeof value[mode] === "object"
        ? value[mode]
        : {};
      Object.entries(source).forEach(([key, count]) => {
        const safeCount = Math.max(0, Number(count || 0));
        if (safeCount) normalized[mode][key] = safeCount;
      });
    });
    return normalized;
  }

  function persistRouteCalibration() {
    try {
      localStorage.setItem(routeCalibrationStorageKey, JSON.stringify(routeCalibrationSnapshot()));
    } catch (error) {
    }
  }

  function resetRouteCalibration() {
    state.routeCalibration = defaultRouteCalibration();
    persistRouteCalibration();
    renderRouteCalibrationSummary();
    const status = $("#universal-status");
    if (status) status.textContent = "分流学习已重置";
  }

  function routeCalibrationSnapshot() {
    return normalizeRouteCalibration(state.routeCalibration || defaultRouteCalibration());
  }

  function renderRouteCalibrationSummary() {
    const target = $("#route-calibration-summary");
    if (!target) return;
    const calibration = routeCalibrationSnapshot();
    if (!calibration.totalCorrections) {
      target.textContent = "分流学习：暂无纠正样本";
      return;
    }
    target.textContent = `分流学习：${calibration.totalCorrections} 次纠正，类型纠正 ${calibration.typeSamples.length} 次，偏置 手${signedPercent(calibration.palmBias)} / 面${signedPercent(calibration.faceBias)}`;
  }

  function signedPercent(value) {
    const sign = value > 0 ? "+" : "";
    return `${sign}${percent(value)}`;
  }

  async function intakeUniversalFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const status = $("#universal-status");
    if (status) status.textContent = "通用识别中";
    let palmCount = 0;
    let faceCount = 0;
    let failed = 0;
    let lastPalmSample = null;
    let lastFaceSample = null;
    const addedPalmSamples = [];
    const addedFaceSamples = [];

    for (const file of files) {
      try {
        const routed = await routeUniversalFile(file);
        if (!routed) {
          failed += 1;
        } else if (routed.mode === "palm") {
          palmCount += 1;
          lastPalmSample = routed.sample;
          addedPalmSamples.push(routed.sample);
        } else {
          faceCount += 1;
          lastFaceSample = routed.sample;
          addedFaceSamples.push(routed.sample);
        }
      } catch (error) {
        failed += 1;
      }
    }

    await Promise.all([
      palmCount ? maybeAutoCallModelEndpoint("palm", addedPalmSamples, { deferRefresh: true, allowNativeReroute: true }) : null,
      faceCount ? maybeAutoCallModelEndpoint("face", addedFaceSamples, { deferRefresh: true, allowNativeReroute: true }) : null
    ]);
    const nativeCorrections = await autoCorrectUniversalModeMismatches([...addedPalmSamples, ...addedFaceSamples]);
    const correctedPalmSamples = nativeCorrections.filter((item) => item.toMode === "palm").map((item) => item.sample);
    const correctedFaceSamples = nativeCorrections.filter((item) => item.toMode === "face").map((item) => item.sample);
    await Promise.all([
      correctedPalmSamples.length ? maybeAutoCallModelEndpoint("palm", correctedPalmSamples, { deferRefresh: true }) : null,
      correctedFaceSamples.length ? maybeAutoCallModelEndpoint("face", correctedFaceSamples, { deferRefresh: true }) : null
    ]);
    const finalBatchSamples = [...addedPalmSamples, ...addedFaceSamples, ...correctedPalmSamples, ...correctedFaceSamples]
      .filter((sample, index, list) => list.indexOf(sample) === index)
      .filter((sample) => state.palmSamples.includes(sample) || state.faceSamples.includes(sample));
    palmCount = finalBatchSamples.filter((sample) => state.palmSamples.includes(sample)).length;
    faceCount = finalBatchSamples.filter((sample) => state.faceSamples.includes(sample)).length;
    lastPalmSample = finalBatchSamples.filter((sample) => state.palmSamples.includes(sample)).slice(-1)[0] || null;
    lastFaceSample = finalBatchSamples.filter((sample) => state.faceSamples.includes(sample)).slice(-1)[0] || null;
    const touchedModes = new Set([
      ...(addedPalmSamples.length ? ["palm"] : []),
      ...(addedFaceSamples.length ? ["face"] : []),
      ...nativeCorrections.flatMap((item) => [item.fromMode, item.toMode])
    ]);
    touchedModes.forEach(refreshModeAfterModelBatch);
    const palmGuideHandled = completeShotGuideCapture("palm", lastPalmSample);
    const faceGuideHandled = completeShotGuideCapture("face", lastFaceSample);
    renderUniversalRoutes();
    if (status) {
      const parts = [];
      if (palmCount) parts.push(`手相 ${palmCount}`);
      if (faceCount) parts.push(`面相 ${faceCount}`);
      if (nativeCorrections.length) parts.push(`原生改流 ${nativeCorrections.length}`);
      if (failed) {
        const lastFailure = state.imageDecodeFailures[state.imageDecodeFailures.length - 1];
        parts.push(`失败 ${failed}${lastFailure ? `（${lastFailure.label}）` : ""}`);
      }
      const guideText = palmGuideHandled || faceGuideHandled ? "向导已验收" : "";
      status.textContent = [parts.length ? parts.join(" / ") : "未识别", guideText].filter(Boolean).join(" / ");
    }
  }

  async function routeUniversalFile(file) {
    const source = await loadImageToWorkingCanvas(file);
    if (!source) return null;
    const route = classifyUniversalImage(source.canvas);
    const mode = route.mode;
    const targetCanvas = mode === "palm" ? $("#palm-canvas") : $("#face-canvas");
    const emptyNode = mode === "palm" ? $("#palm-empty") : $("#face-empty");
    const result = copyCanvasToCanvas(source.canvas, targetCanvas, emptyNode);
    const routeEvidence = universalRouteEvidence(route);
    const metrics = {
      ...(mode === "palm" ? route.palmMetrics : route.faceMetrics),
      routeMode: route.mode,
      routeConfidence: route.confidence,
      routeEvidence
    };
    const sample = addSample(mode, file.name, "auto", metrics, routeEvidence);
    sample.imageDecode = source.imageDecode || null;
    if (mode === "palm") state.palmImage = result;
    else state.faceImage = result;
    setPreviewBaseCanvas(mode, targetCanvas);
    updateSampleThumbnail(sample, targetCanvas, "universal_intake");
    captureSampleRecognitionImage(sample, targetCanvas, "universal_intake");
    await preferOriginalRecognitionImage(sample, file);
    drawRecognitionOverlay(targetCanvas, mode, sample.metrics, sample.type, sample.modelResult);
    renderOverlaySummary(mode, sample);
    state.universalRoutes.unshift({
      createdAt: new Date().toISOString(),
      fileName: file.name,
      mode,
      sampleId: sample.id,
      sampleType: sample.type,
      confidence: route.confidence,
      routeGap: route.routeGap,
      needsReview: route.needsReview,
      routeCandidates: route.routeCandidates || [],
      primaryCandidate: route.primaryCandidate || null,
      secondaryCandidate: route.secondaryCandidate || null,
      palmScore: route.palmScore,
      faceScore: route.faceScore,
      rawPalmScore: route.rawPalmScore,
      rawFaceScore: route.rawFaceScore,
      calibration: route.calibration,
      reasons: route.reasons,
      imageDataUrl: sample.pendingRecognitionImage && sample.pendingRecognitionImage.dataUrl || canvasToDataUrl(source.canvas),
      palmMetrics: mode === "palm" ? sample.metrics : route.palmMetrics,
      faceMetrics: mode === "face" ? sample.metrics : route.faceMetrics,
      rotation: sample.rotation,
      rotationCorrections: sample.rotationCorrections,
      preprocessCorrections: sample.preprocessCorrections,
      correction: null
    });
    state.universalRoutes = state.universalRoutes.slice(0, 12);
    return { mode, sample, route };
  }

  function nativeUniversalRerouteCandidate(sample) {
    if (!sample || !sampleModeMismatch(sample) || !sample.routeEvidence || sample.routeEvidence.source !== "universal_intake") return null;
    const evidence = sample.modeMismatch || (sample.modelResult && sample.modelResult.modeMismatch) || null;
    if (!evidence || evidence.source !== "apple_vision_cross_mode_probe") return null;
    const endpointConfig = readModelEndpointConfig();
    if (endpointConfig.url !== defaultModelEndpointUrl || !sample.modelResult || sample.modelResult.adapter !== "apple-vision-cross-mode" || !sample.modelResult.nativeVision || sample.modelResult.nativeVision.fallbackSuppressed !== true) return null;
    const fromMode = evidence.requestedMode;
    const toMode = evidence.suggestedMode;
    if (!["palm", "face"].includes(fromMode) || !["palm", "face"].includes(toMode) || fromMode === toMode) return null;
    const minimumPoints = toMode === "palm" ? 18 : 10;
    if (Number(evidence.confidence || 0) < 0.55 || Number(evidence.keypointCount || 0) < minimumPoints) return null;
    const route = state.universalRoutes.find((item) => item && item.sampleId === sample.id && item.mode === fromMode) || null;
    if (route && route.correction && route.correction.source === "native_cross_mode_reroute") return null;
    const imageDataUrl = route && route.imageDataUrl || sample.pendingRecognitionImage && sample.pendingRecognitionImage.dataUrl || "";
    if (!imageDataUrl) return null;
    return { sample, route, evidence, fromMode, toMode, imageDataUrl };
  }

  async function autoCorrectUniversalModeMismatches(samples) {
    const corrections = [];
    for (const sample of Array.isArray(samples) ? samples : []) {
      const candidate = nativeUniversalRerouteCandidate(sample);
      if (!candidate) continue;
      const correction = await applyNativeUniversalReroute(candidate);
      if (correction) corrections.push(correction);
      else releasePendingRecognitionImage(sample, sampleRecognitionRevision(sample));
    }
    return corrections;
  }

  async function applyNativeUniversalReroute(candidate) {
    const { sample: oldSample, route, evidence, fromMode, toMode, imageDataUrl } = candidate;
    const imageResult = await drawDataUrlToModeCanvas(imageDataUrl, toMode);
    if (!imageResult || !imageResult.canvas) return null;
    removeSampleById(fromMode, oldSample.id);
    const correctedAt = new Date().toISOString();
    const routeSource = route || {
      ...(oldSample.routeEvidence || {}),
      reasons: oldSample.routeEvidence && oldSample.routeEvidence.reasons || [],
      palmMetrics: null,
      faceMetrics: null
    };
    const routeEvidence = nativeCorrectedRouteEvidence(routeSource, evidence, fromMode, toMode, correctedAt, oldSample.id);
    const targetMetrics = analyzeImage(imageResult.canvas, toMode);
    const routedMetrics = route && route[`${toMode}Metrics`];
    if (routedMetrics && routedMetrics.suggestedType !== "mixed") targetMetrics.suggestedType = routedMetrics.suggestedType;
    const metrics = {
      ...targetMetrics,
      routeMode: toMode,
      routeConfidence: routeEvidence.confidence,
      routeEvidence
    };
    const sample = addSample(toMode, route.fileName, "auto", metrics, routeEvidence);
    sample.routeCorrected = true;
    sample.imageDecode = oldSample.imageDecode || null;
    sample.sampleProvenance = normalizeSampleProvenance(oldSample.sampleProvenance);
    sample.rotation = normalizeTotalRotation(oldSample.rotation || route.rotation || 0);
    sample.rotationCorrections = Array.isArray(oldSample.rotationCorrections) ? deepClone(oldSample.rotationCorrections) : [];
    sample.preprocessCorrections = Array.isArray(oldSample.preprocessCorrections) ? deepClone(oldSample.preprocessCorrections) : [];
    if (toMode === "palm") state.palmImage = imageResult;
    else state.faceImage = imageResult;
    setPreviewBaseCanvas(toMode, imageResult.canvas);
    updateSampleThumbnail(sample, imageResult.canvas, "native_cross_mode_reroute");
    captureSampleRecognitionImage(sample, imageResult.canvas, "native_cross_mode_reroute");
    delete oldSample.pendingRecognitionImage;
    if (route) {
      route.originalSampleId = route.originalSampleId || oldSample.id;
      route.initialConfidence = Number.isFinite(Number(route.initialConfidence)) ? route.initialConfidence : route.confidence;
      route.mode = toMode;
      route.sampleId = sample.id;
      route.sampleType = sample.type;
      route.confidence = routeEvidence.confidence;
      route.needsReview = routeEvidence.needsReview;
      route.nativeModeEvidence = deepClone(routeEvidence.nativeModeEvidence);
      route.correction = {
        from: fromMode,
        to: toMode,
        correctedAt,
        source: "native_cross_mode_reroute",
        confidence: routeEvidence.confidence
      };
      route.reasons = routeEvidence.reasons;
      route.rotation = sample.rotation;
      route.rotationCorrections = sample.rotationCorrections;
      route.preprocessCorrections = sample.preprocessCorrections;
      if (toMode === "palm") route.palmMetrics = sample.metrics;
      else route.faceMetrics = sample.metrics;
    }
    return { fromMode, toMode, oldSampleId: oldSample.id, sample, route };
  }

  function nativeCorrectedRouteEvidence(route, evidence, fromMode, toMode, correctedAt, originalSampleId) {
    const confidence = roundMetric(clamp(Number(evidence.confidence || 0), 0, 1));
    const nativeModeEvidence = {
      detected: true,
      requestedMode: fromMode,
      suggestedMode: toMode,
      confidence,
      keypointCount: Math.max(0, Number(evidence.keypointCount || 0)),
      subjectCandidateCount: Math.max(0, Number(evidence.subjectCandidateCount || 0)),
      source: "apple_vision_cross_mode_probe",
      sourceRefs: toMode === "palm" ? ["web.apple-hand#output"] : ["web.apple-face#output"],
      boundaries: ["class_routing_only", "no_palmistry_or_physiognomy_semantics"]
    };
    return {
      source: "universal_intake",
      mode: toMode,
      originalMode: fromMode,
      correctedMode: toMode,
      originalSampleId,
      correctionSource: "native_cross_mode_reroute",
      correctedAt,
      confidence,
      palmScore: route.palmScore,
      faceScore: route.faceScore,
      rawPalmScore: route.rawPalmScore,
      rawFaceScore: route.rawFaceScore,
      routeGap: route.routeGap,
      needsReview: confidence < 0.72 || Number(evidence.subjectCandidateCount || 0) > 1,
      routeCandidates: route.routeCandidates || [],
      primaryCandidate: route.primaryCandidate || null,
      secondaryCandidate: route.secondaryCandidate || null,
      calibration: route.calibration,
      palmSuggestedType: route.palmMetrics ? route.palmMetrics.suggestedType : "",
      faceSuggestedType: route.faceMetrics ? route.faceMetrics.suggestedType : "",
      nativeModeEvidence,
      reasons: [
        ...(Array.isArray(route.reasons) ? route.reasons.filter((reason) => !String(reason).startsWith("原生反查改流为")) : []),
        `原生反查改流为${routeModeLabel(toMode)} ${percent(confidence)}`
      ].slice(-6)
    };
  }

  function loadImageToWorkingCanvas(file) {
    const canvas = document.createElement("canvas");
    return loadImageToCanvas(file, canvas, null);
  }

  function copyCanvasToCanvas(sourceCanvas, canvas, emptyNode) {
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    if (emptyNode) emptyNode.classList.add("off");
    return { canvas, width: canvas.width, height: canvas.height };
  }

  function canvasToDataUrl(canvas) {
    try {
      return canvas.toDataURL("image/jpeg", 0.86);
    } catch (error) {
      return "";
    }
  }

  function updateSampleThumbnail(sample, canvas, source = "current_canvas") {
    if (!sample || !canvas || !canvas.width || !canvas.height) return null;
    const thumbnail = sampleThumbnailFromCanvas(canvas, source);
    if (!thumbnail) return null;
    sample.thumbnail = thumbnail;
    return thumbnail;
  }

  function sampleThumbnailFromCanvas(canvas, source = "current_canvas") {
    try {
      const scale = Math.min(1, caseThumbnailMaxSide / Math.max(canvas.width, canvas.height));
      const width = Math.max(1, Math.round(canvas.width * scale));
      const height = Math.max(1, Math.round(canvas.height * scale));
      const target = document.createElement("canvas");
      target.width = width;
      target.height = height;
      const context = target.getContext("2d", { willReadFrequently: true });
      context.drawImage(canvas, 0, 0, width, height);
      return {
        source,
        width,
        height,
        dataUrl: target.toDataURL("image/jpeg", caseThumbnailQuality),
        capturedAt: new Date().toISOString()
      };
    } catch (error) {
      return null;
    }
  }

  function sampleRecognitionRevision(sample) {
    const value = Number(sample && sample.recognitionRevision);
    return Number.isInteger(value) && value >= 0 ? value : 0;
  }

  function appendRecognitionResultAudit(sample, event) {
    if (!sample || !event) return null;
    const entry = {
      status: String(event.status || "unknown").slice(0, 40),
      revision: Math.max(0, Number(event.revision || 0)),
      currentRevision: Math.max(0, Number(event.currentRevision ?? event.revision ?? 0)),
      source: String(event.source || "recognition").slice(0, 60),
      modelVersion: event.modelVersion ? String(event.modelVersion).slice(0, 80) : null,
      recordedAt: event.recordedAt || new Date().toISOString()
    };
    sample.recognitionResultHistory = [
      ...(Array.isArray(sample.recognitionResultHistory) ? sample.recognitionResultHistory : []),
      entry
    ].slice(-12);
    sample.recognitionResultAudit = entry;
    return entry;
  }

  function advanceSampleRecognitionRevision(sample, source, status = "image_revision_advanced") {
    if (!sample) return 0;
    const revision = sampleRecognitionRevision(sample) + 1;
    sample.recognitionRevision = revision;
    appendRecognitionResultAudit(sample, { status, revision, currentRevision: revision, source });
    return revision;
  }

  function invalidatePendingRecognitionImage(sample, source = "image_transform") {
    if (!sample) return 0;
    const revision = advanceSampleRecognitionRevision(sample, source, "image_invalidated");
    delete sample.pendingRecognitionImage;
    sample.recognitionCache = null;
    return revision;
  }

  function recognitionResultIsCurrent(sample, expectedRevision, resultRevision = null) {
    if (!sample) return false;
    const expected = Number(expectedRevision);
    if (!Number.isInteger(expected) || expected < 0) return true;
    if (sampleRecognitionRevision(sample) !== expected) return false;
    const returned = Number(resultRevision);
    return !Number.isInteger(returned) || returned < 0 || returned === expected;
  }

  function recognitionAuditCount(sample, status) {
    return (Array.isArray(sample && sample.recognitionResultHistory) ? sample.recognitionResultHistory : [])
      .filter((item) => item && item.status === status).length;
  }

  function releasePendingRecognitionImage(sample, expectedRevision) {
    if (!sample || !sample.pendingRecognitionImage) return false;
    if (Number(sample.pendingRecognitionImage.revision) !== Number(expectedRevision)) return false;
    delete sample.pendingRecognitionImage;
    return true;
  }

  function captureSampleRecognitionImage(sample, canvas, source = "current_canvas") {
    if (!sample || !canvas || !canvas.width || !canvas.height) return null;
    try {
      const scale = Math.min(1, recognitionImageMaxSide / Math.max(canvas.width, canvas.height));
      const width = Math.max(1, Math.round(canvas.width * scale));
      const height = Math.max(1, Math.round(canvas.height * scale));
      const target = document.createElement("canvas");
      target.width = width;
      target.height = height;
      const context = target.getContext("2d", { willReadFrequently: true });
      context.drawImage(canvas, 0, 0, width, height);
      const dataUrl = target.toDataURL("image/jpeg", recognitionImageQuality);
      const revision = advanceSampleRecognitionRevision(sample, source, "image_captured");
      sample.pendingRecognitionImage = {
        source,
        width,
        height,
        dataUrl,
        revision,
        capturedAt: new Date().toISOString()
      };
      return sample.pendingRecognitionImage;
    } catch (error) {
      sample.pendingRecognitionImage = null;
      return null;
    }
  }

  function classifyUniversalImage(canvas) {
    const palmMetrics = analyzeImage(canvas, "palm");
    const faceMetrics = analyzeImage(canvas, "face");
    const palmTypeFit = palmMetrics.suggestedType === "mixed" ? 0.12 : 0.72;
    const faceTypeFit = faceMetrics.suggestedType === "mixed" ? 0.12 : 0.72;
    const rawPalmScore = clamp(
      palmMetrics.quality * 0.34 +
      palmMetrics.lineClarity * 0.24 +
      palmMetrics.textureBusy * 0.14 +
      palmTypeFit * 0.2 +
      (1 - faceMetrics.symmetry) * 0.08,
      0,
      1
    );
    const rawFaceScore = clamp(
      faceMetrics.quality * 0.32 +
      faceMetrics.symmetry * 0.28 +
      faceMetrics.subjectCenteredness * 0.12 +
      faceTypeFit * 0.2 +
      faceMetrics.skinCoverage * 0.08,
      0,
      1
    );
    const calibration = routeCalibrationSnapshot();
    const palmScore = clamp(rawPalmScore + calibration.palmBias, 0, 1);
    const faceScore = clamp(rawFaceScore + calibration.faceBias, 0, 1);
    const mode = faceScore > palmScore ? "face" : "palm";
    const gap = Math.abs(faceScore - palmScore);
    const confidence = clamp(0.52 + gap * 0.9, 0.52, 0.96);
    const routeGap = roundMetric(gap);
    const routeCandidates = routeCandidateList({
      palmScore,
      faceScore,
      rawPalmScore,
      rawFaceScore,
      palmMetrics,
      faceMetrics
    });
    const needsReview = confidence < 0.62 || routeGap < 0.11;
    return {
      mode,
      confidence: roundMetric(confidence),
      routeGap,
      needsReview,
      routeCandidates,
      primaryCandidate: routeCandidates[0] || null,
      secondaryCandidate: routeCandidates[1] || null,
      palmScore: roundMetric(palmScore),
      faceScore: roundMetric(faceScore),
      rawPalmScore: roundMetric(rawPalmScore),
      rawFaceScore: roundMetric(rawFaceScore),
      calibration: routeCalibrationSignal(calibration),
      palmMetrics,
      faceMetrics,
      palmSuggestedType: palmMetrics.suggestedType,
      faceSuggestedType: faceMetrics.suggestedType,
      reasons: universalRouteReasons(mode, palmMetrics, faceMetrics, palmScore, faceScore, calibration)
    };
  }

  function routeCandidateList({ palmScore, faceScore, rawPalmScore, rawFaceScore, palmMetrics, faceMetrics }) {
    return [
      routeCandidate("palm", palmScore, rawPalmScore, palmMetrics),
      routeCandidate("face", faceScore, rawFaceScore, faceMetrics)
    ].sort((a, b) => b.score - a.score);
  }

  function routeCandidate(mode, score, rawScore, metrics) {
    return {
      mode,
      label: routeModeLabel(mode),
      score: roundMetric(score),
      rawScore: roundMetric(rawScore),
      suggestedType: metrics ? metrics.suggestedType : "mixed",
      suggestedLabel: sampleTypeLabel(mode, metrics ? metrics.suggestedType : "mixed"),
      quality: roundMetric(metrics ? metrics.quality || 0 : 0),
      subjectAreaRatio: roundMetric(metrics ? metrics.subjectAreaRatio || 0 : 0),
      subjectCenteredness: roundMetric(metrics ? metrics.subjectCenteredness || 0 : 0),
      evidence: routeCandidateEvidence(mode, metrics)
    };
  }

  function routeCandidateEvidence(mode, metrics) {
    if (!metrics) return [];
    const evidence = [];
    if (metrics.suggestedType && metrics.suggestedType !== "mixed") evidence.push(sampleTypeLabel(mode, metrics.suggestedType));
    if (mode === "palm" && metrics.lineClarity > 0.34) evidence.push("线纹");
    if (mode === "palm" && metrics.textureBusy > 0.32) evidence.push("纹理");
    if (mode === "face" && metrics.symmetry > 0.52) evidence.push("对称");
    if (mode === "face" && metrics.subjectCenteredness > 0.42) evidence.push("居中");
    if (metrics.skinCoverage > 0.12) evidence.push("肤色主体");
    return evidence.slice(0, 4);
  }

  function universalRouteReasons(mode, palmMetrics, faceMetrics, palmScore, faceScore, calibration) {
    const reasons = [];
    if (mode === "palm") {
      if (palmMetrics.suggestedType !== "mixed") reasons.push(`手部角度 ${sampleTypeLabel("palm", palmMetrics.suggestedType)}`);
      if (palmMetrics.lineClarity > 0.34) reasons.push("线纹/纹理较明显");
      if (faceMetrics.symmetry < 0.58) reasons.push("面部对称证据不足");
      if (calibration && Math.abs(calibration.palmBias) >= 0.01) reasons.push(`分流学习 手${signedPercent(calibration.palmBias)}`);
      reasons.push(`手相分 ${percent(palmScore)}`);
    } else {
      if (faceMetrics.suggestedType !== "mixed") reasons.push(`面部角度 ${sampleTypeLabel("face", faceMetrics.suggestedType)}`);
      if (faceMetrics.symmetry > 0.52) reasons.push("左右对称证据较强");
      if (faceMetrics.subjectCenteredness > 0.42) reasons.push("主体居中度可用");
      if (calibration && Math.abs(calibration.faceBias) >= 0.01) reasons.push(`分流学习 面${signedPercent(calibration.faceBias)}`);
      reasons.push(`面相分 ${percent(faceScore)}`);
    }
    return reasons.slice(0, 4);
  }

  function routeCalibrationSignal(calibration) {
    return {
      version: 1,
      palmBias: roundMetric(calibration.palmBias),
      faceBias: roundMetric(calibration.faceBias),
      totalCorrections: calibration.totalCorrections,
      palmToFace: calibration.palmToFace,
      faceToPalm: calibration.faceToPalm,
      typeCorrectionCount: calibration.typeSamples.length,
      typeCorrections: calibration.typeCorrections,
      updatedAt: calibration.updatedAt
    };
  }

  function universalRouteEvidence(route) {
    return {
      source: "universal_intake",
      mode: route.mode,
      confidence: route.confidence,
      palmScore: route.palmScore,
      faceScore: route.faceScore,
      routeGap: route.routeGap,
      needsReview: route.needsReview,
      routeCandidates: route.routeCandidates || [],
      primaryCandidate: route.primaryCandidate || null,
      secondaryCandidate: route.secondaryCandidate || null,
      rawPalmScore: route.rawPalmScore,
      rawFaceScore: route.rawFaceScore,
      calibration: route.calibration,
      palmSuggestedType: route.palmSuggestedType,
      faceSuggestedType: route.faceSuggestedType,
      reasons: route.reasons
    };
  }

  function renderUniversalRoutes() {
    const target = $("#universal-routes");
    if (!target) return;
    if (!state.universalRoutes.length) {
      target.textContent = "还没有通用识别记录";
      return;
    }
    setHtml(target, state.universalRoutes.map((item) => `
      <div class="route-item">
        <div>
          <strong>${escapeHtml(item.fileName)}</strong>
          <span>${item.mode === "palm" ? "手相" : "面相"} · ${sampleTypeLabel(item.mode, item.sampleType)} · 分流置信 ${percent(item.confidence)}</span>
          <div class="tag-row">
            ${item.correction ? `<span class="tag green">${item.correction.source === "native_cross_mode_reroute" ? "原生改流" : "已纠正"} ${routeModeLabel(item.correction.from)}→${routeModeLabel(item.correction.to)}</span>` : ""}
            ${item.needsReview ? `<span class="tag red">候选接近</span>` : ""}
          </div>
          ${Array.isArray(item.routeCandidates) && item.routeCandidates.length ? `<div class="case-meta">候选：${item.routeCandidates.map(routeCandidateSummary).join(" / ")}</div>` : ""}
          <div class="case-meta">${item.reasons.map(escapeHtml).join("、")}</div>
        </div>
        <div class="route-actions">
          <button class="secondary-action" type="button" data-open-route-mode="${item.mode}">查看</button>
          <button class="secondary-action" type="button" data-correct-route-id="${escapeHtml(item.sampleId)}" data-correct-route-mode="${oppositeRouteMode(item.mode)}">改为${routeModeLabel(oppositeRouteMode(item.mode))}</button>
        </div>
      </div>
    `).join(""));
  }

  function routeCandidateSummary(candidate) {
    return `${escapeHtml(candidate.label)} ${percent(candidate.score)} ${escapeHtml(candidate.suggestedLabel || "")}`.trim();
  }

  async function correctUniversalRoute(sampleId, targetMode) {
    if (!["palm", "face"].includes(targetMode)) return;
    const route = state.universalRoutes.find((item) => item.sampleId === sampleId);
    if (!route) return;
    const oldMode = route.mode;
    if (oldMode === targetMode) {
      activateMode(targetMode);
      return;
    }
    removeSampleById(oldMode, sampleId);
    const imageResult = route.imageDataUrl ? await drawDataUrlToModeCanvas(route.imageDataUrl, targetMode) : null;
    if (imageResult && targetMode === "palm") state.palmImage = imageResult;
    if (imageResult && targetMode === "face") state.faceImage = imageResult;
    const routeEvidence = correctedRouteEvidence(route, targetMode, oldMode);
    const metrics = {
      ...(targetMode === "palm" ? route.palmMetrics : route.faceMetrics),
      routeMode: route.mode,
      routeConfidence: route.confidence,
      routeEvidence
    };
    const sample = addSample(targetMode, route.fileName, "auto", metrics, routeEvidence);
    sample.routeCorrected = true;
    if (imageResult && imageResult.canvas) {
      setPreviewBaseCanvas(targetMode, imageResult.canvas);
      updateSampleThumbnail(sample, imageResult.canvas, "manual_route_correction");
    }
    route.mode = targetMode;
    route.sampleId = sample.id;
    route.sampleType = sample.type;
    route.correction = {
      from: oldMode,
      to: targetMode,
      correctedAt: new Date().toISOString(),
      source: "manual_route_correction"
    };
    route.calibrationAfter = recordRouteCorrection(route, targetMode, oldMode);
    route.reasons = [...route.reasons.filter((reason) => !reason.startsWith("人工纠正为")), `人工纠正为${routeModeLabel(targetMode)}`];
    if (oldMode === "palm") updatePalmFromSamples();
    else updateFaceFromSamples();
    if (targetMode === "palm") updatePalmFromSamples();
    else updateFaceFromSamples();
    renderUniversalRoutes();
    const status = $("#universal-status");
    if (status) status.textContent = `已纠正为${routeModeLabel(targetMode)}`;
    activateMode(targetMode);
  }

  function removeSampleById(mode, sampleId) {
    const key = mode === "palm" ? "palmSamples" : "faceSamples";
    state[key] = state[key].filter((sample) => sample.id !== sampleId);
    rebuildModelRegions(mode);
  }

  function drawDataUrlToModeCanvas(dataUrl, mode) {
    const canvas = $(mode === "palm" ? "#palm-canvas" : "#face-canvas");
    const emptyNode = $(mode === "palm" ? "#palm-empty" : "#face-empty");
    if (!canvas || !dataUrl) return Promise.resolve(null);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        if (emptyNode) emptyNode.classList.add("off");
        resolve({ canvas, width: canvas.width, height: canvas.height });
      };
      image.onerror = () => resolve(null);
      image.src = dataUrl;
    });
  }

  function correctedRouteEvidence(route, targetMode, oldMode) {
    return {
      source: "universal_intake",
      mode: targetMode,
      originalMode: oldMode,
      correctedMode: targetMode,
      correctionSource: "manual_route_correction",
      correctedAt: new Date().toISOString(),
      confidence: route.confidence,
      palmScore: route.palmScore,
      faceScore: route.faceScore,
      rawPalmScore: route.rawPalmScore,
      rawFaceScore: route.rawFaceScore,
      calibration: route.calibration,
      palmSuggestedType: route.palmMetrics ? route.palmMetrics.suggestedType : "",
      faceSuggestedType: route.faceMetrics ? route.faceMetrics.suggestedType : "",
      reasons: [...route.reasons, `人工纠正为${routeModeLabel(targetMode)}`]
    };
  }

  function recordRouteCorrection(route, targetMode, oldMode) {
    const calibration = routeCalibrationSnapshot();
    const delta = routeCorrectionDelta(route);
    if (targetMode === "palm") {
      calibration.palmBias = roundMetric(clamp(calibration.palmBias + delta, -0.16, 0.16));
      calibration.faceBias = roundMetric(clamp(calibration.faceBias - delta * 0.6, -0.16, 0.16));
      calibration.faceToPalm += 1;
    } else {
      calibration.faceBias = roundMetric(clamp(calibration.faceBias + delta, -0.16, 0.16));
      calibration.palmBias = roundMetric(clamp(calibration.palmBias - delta * 0.6, -0.16, 0.16));
      calibration.palmToFace += 1;
    }
    calibration.totalCorrections += 1;
    calibration.updatedAt = new Date().toISOString();
    calibration.samples.unshift({
      correctedAt: calibration.updatedAt,
      from: oldMode,
      to: targetMode,
      confidence: route.confidence,
      palmScore: route.palmScore,
      faceScore: route.faceScore,
      rawPalmScore: route.rawPalmScore,
      rawFaceScore: route.rawFaceScore,
      delta: roundMetric(delta),
      reasons: route.reasons.slice(0, 5)
    });
    calibration.samples = calibration.samples.slice(0, 40);
    state.routeCalibration = calibration;
    persistRouteCalibration();
    renderRouteCalibrationSummary();
    return routeCalibrationSignal(calibration);
  }

  function routeCorrectionDelta(route) {
    const confidence = Number(route.confidence || 0.52);
    const gap = Math.abs(Number(route.faceScore || 0) - Number(route.palmScore || 0));
    return roundMetric(clamp(0.018 + (1 - confidence) * 0.026 + Math.max(0, 0.08 - gap) * 0.08, 0.018, 0.045));
  }

  function oppositeRouteMode(mode) {
    return mode === "palm" ? "face" : "palm";
  }

  function routeModeLabel(mode) {
    return mode === "palm" ? "手相" : "面相";
  }

  function initCamera() {
    $("#start-palm-camera").addEventListener("click", () => {
      startCamera("palm", $("#palm-video"), $("#palm-status"));
    });
    $("#capture-palm-camera").addEventListener("click", () => {
      captureCamera("palm", $("#palm-video"), $("#palm-canvas"), $("#palm-empty"), $("#palm-status"));
    });
    $("#clear-palm-samples").addEventListener("click", () => {
      state.palmSamples = [];
      state.palmMetrics = null;
      state.modelRegions.palm = new Set();
      state.shotGuides.palm = null;
      state.geometryCorrections.palm = [];
      state.creaseReconnectSelection = [];
      state.creaseEditorNotice = "";
      state.previewBaseCanvases.palm = null;
      invalidateDerivedData();
      resetAutoAnnotations("palm-line-annotations");
      renderPalmMetrics();
      renderSampleList("palm");
      $("#palm-overlay-summary").textContent = "识别叠加层会显示在预览图上";
      renderSubjectCandidateControls("palm", null);
      renderPalmReport();
      $("#palm-status").textContent = "已清空";
    });
    $("#export-palm-json").addEventListener("click", () => {
      exportAnalysisJson("palm");
    });
    $("#start-face-camera").addEventListener("click", () => {
      startCamera("face", $("#face-video"), $("#face-status"));
    });
    $("#capture-face-camera").addEventListener("click", () => {
      captureCamera("face", $("#face-video"), $("#face-canvas"), $("#face-empty"), $("#face-status"));
    });
    $("#clear-face-samples").addEventListener("click", () => {
      state.faceSamples = [];
      state.faceMetrics = null;
      state.modelRegions.face = new Set();
      state.shotGuides.face = null;
      state.geometryCorrections.face = [];
      state.previewBaseCanvases.face = null;
      invalidateDerivedData();
      resetAutoAnnotations("face-zone-annotations");
      renderFaceMetrics();
      renderSampleList("face");
      $("#face-overlay-summary").textContent = "识别叠加层会显示在预览图上";
      renderSubjectCandidateControls("face", null);
      renderFaceReport();
      $("#face-status").textContent = "已清空";
    });
    $("#export-face-json").addEventListener("click", () => {
      exportAnalysisJson("face");
    });
  }

  function initGeometryControls() {
    document.querySelectorAll("[data-geometry-mode]").forEach((panel) => {
      const mode = panel.dataset.geometryMode;
      panel.querySelectorAll("[data-geometry-toggle]").forEach((input) => {
        input.addEventListener("change", () => {
          const key = input.dataset.geometryToggle;
          state.geometryOverlay[mode][key] = Boolean(input.checked);
          updateGeometryCursor(mode);
          redrawLatestPreview(mode);
        });
      });
    });
    document.querySelectorAll("[data-geometry-clear]").forEach((button) => {
      button.addEventListener("click", () => {
        clearGeometryCorrections(button.dataset.geometryClear);
      });
    });
    document.querySelectorAll("[data-rotate-image]").forEach((button) => {
      button.addEventListener("click", () => {
        rotateCurrentImage(button.dataset.rotateImage, Number(button.dataset.rotateDegrees || 0));
      });
    });
    document.querySelectorAll("[data-preprocess-image]").forEach((button) => {
      button.addEventListener("click", () => {
        preprocessCurrentImage(button.dataset.preprocessImage, button.dataset.preprocessAction);
      });
    });
    document.querySelectorAll("[data-subject-candidates-mode]").forEach((panel) => {
      panel.addEventListener("click", (event) => {
        const button = event.target.closest("[data-select-subject-candidate]");
        if (!button) return;
        selectSubjectCandidate(panel.dataset.subjectCandidatesMode, Number(button.dataset.selectSubjectCandidate));
      });
    });
    bindGeometryCanvas("palm", $("#palm-canvas"));
    bindGeometryCanvas("face", $("#face-canvas"));
    updateGeometryCursor("palm");
    updateGeometryCursor("face");
  }

  function updateGeometryCursor(mode) {
    const canvas = canvasForMode(mode);
    if (canvas) canvas.style.cursor = state.geometryOverlay[mode].edit ? "crosshair" : "";
  }

  async function startCamera(mode, video, statusNode) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusNode.textContent = "浏览器不支持";
      return;
    }
    try {
      stopCamera(mode);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode === "palm" ? "environment" : "user",
          width: { ideal: 1280 },
          height: { ideal: 960 }
        },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      video.classList.add("active");
      state[`${mode}Stream`] = stream;
      statusNode.textContent = "摄像头已开";
    } catch (error) {
      statusNode.textContent = "摄像头受限";
    }
  }

  function stopCamera(mode) {
    const stream = state[`${mode}Stream`];
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      state[`${mode}Stream`] = null;
    }
  }

  function captureCamera(mode, video, canvas, emptyNode, statusNode) {
    if (!video.videoWidth || !video.videoHeight) {
      statusNode.textContent = "先开摄像头";
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    emptyNode.classList.add("off");
    const metrics = analyzeImage(canvas, mode);
    let sample = null;
    if (mode === "palm") {
      sample = addSample("palm", "摄像头手相", $("#palm-photo-type").value, metrics);
      setPreviewBaseCanvas("palm", canvas);
      updateSampleThumbnail(sample, canvas, "camera");
      drawRecognitionOverlay(canvas, "palm", sample.metrics, sample.type, sample.modelResult);
      renderOverlaySummary("palm", sample);
      updatePalmFromSamples();
    } else {
      sample = addSample("face", "摄像头面相", $("#face-photo-type").value, metrics);
      setPreviewBaseCanvas("face", canvas);
      updateSampleThumbnail(sample, canvas, "camera");
      drawRecognitionOverlay(canvas, "face", sample.metrics, sample.type, sample.modelResult);
      renderOverlaySummary("face", sample);
      updateFaceFromSamples();
    }
    if (!completeShotGuideCapture(mode, sample)) {
      statusNode.textContent = "已拍照识别";
    }
  }

  function imageDecodeFailureLabel(code) {
    const runtime = window.PalmFaceImageDecode;
    if (runtime && typeof runtime.failureLabel === "function") return runtime.failureLabel(code);
    return {
      image_decode_runtime_failed: "图片解码组件未加载",
      image_file_unsupported: "不是可识别图片格式",
      image_file_too_large: "文件超过32MB",
      image_decode_timeout: "图片解码超过15秒",
      image_decode_failed: "图片损坏或浏览器不支持",
      image_dimensions_invalid: "图片尺寸无效",
      image_dimensions_too_large: "图片像素超过8000万",
      canvas_draw_failed: "图片画布转换失败"
    }[code] || "图片无法解码";
  }

  function recordImageDecodeFailure(file, code) {
    const item = {
      fileName: String(file && file.name || "未命名图片").slice(0, 120),
      code,
      label: imageDecodeFailureLabel(code),
      failedAt: new Date().toISOString()
    };
    state.imageDecodeFailures = [...state.imageDecodeFailures, item].slice(-12);
    return item;
  }

  function imageUploadStatusSummary(applied, failed, samples = []) {
    const parts = [];
    const sampleList = Array.isArray(samples) ? samples.filter(Boolean) : [];
    const noTargetCount = sampleList.filter(sampleNoTarget).length;
    const modeMismatchCount = sampleList.filter(sampleModeMismatch).length;
    const recognizedCount = Math.max(0, applied - noTargetCount - modeMismatchCount);
    if (recognizedCount) parts.push(recognizedCount > 1 ? `${recognizedCount}张已识别` : "已识别");
    if (noTargetCount) parts.push(noTargetCount === applied ? "未识别到手或脸，请换清晰目标照片" : `无可分析目标 ${noTargetCount} 张`);
    if (modeMismatchCount) parts.push(`类别不符 ${modeMismatchCount} 张`);
    if (failed) parts.push(`失败 ${failed}（格式不支持或文件损坏）`);
    return parts.join(" / ") || "未识别";
  }

  function normalizeImageDecodeAudit(value) {
    if (!value || typeof value !== "object") return null;
    return {
      version: 1,
      decoder: String(value.decoder || "unknown").slice(0, 48),
      mimeType: String(value.mimeType || "unknown").slice(0, 80),
      fileBytes: Math.max(0, Math.min(imageUploadMaxBytes, Number(value.fileBytes || 0))),
      sourceWidth: Math.max(0, Number(value.sourceWidth || 0)),
      sourceHeight: Math.max(0, Number(value.sourceHeight || 0)),
      canvasWidth: Math.max(0, Number(value.canvasWidth || 0)),
      canvasHeight: Math.max(0, Number(value.canvasHeight || 0)),
      orientationPolicy: "from_image_normalized_to_canvas",
      endpointEncoding: "image/jpeg",
      sourceRefs: ["web.apple-image-orientation#orientation"],
      decodedAt: value.decodedAt || null
    };
  }

  function loadImageDecodeRuntime() {
    if (window.PalmFaceImageDecode) return Promise.resolve(window.PalmFaceImageDecode);
    if (imageDecodeRuntimePromise) return imageDecodeRuntimePromise;
    imageDecodeRuntimePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./image-decode.js";
      script.async = true;
      script.onload = () => window.PalmFaceImageDecode
        ? resolve(window.PalmFaceImageDecode)
        : reject(new Error("image_decode_runtime_failed"));
      script.onerror = () => reject(new Error("image_decode_runtime_failed"));
      document.head.appendChild(script);
    }).catch((error) => {
      imageDecodeRuntimePromise = null;
      throw error;
    });
    return imageDecodeRuntimePromise;
  }

  async function loadImageToCanvas(file, canvas, emptyNode) {
    if (!file || !canvas) return null;
    try {
      const runtime = await loadImageDecodeRuntime();
      const result = await runtime.decodeToCanvas(file, canvas);
      if (emptyNode) emptyNode.classList.add("off");
      return {
        ...result,
        imageDecode: normalizeImageDecodeAudit(result.imageDecode)
      };
    } catch (error) {
      const runtime = window.PalmFaceImageDecode;
      const code = runtime && typeof runtime.errorCode === "function"
        ? runtime.errorCode(error)
        : (imageDecodeFailureLabel(shortError(error)) === "图片无法解码" ? "image_decode_failed" : shortError(error));
      recordImageDecodeFailure(file, code);
      return null;
    }
  }

  async function preferOriginalRecognitionImage(sample, file) {
    const runtime = window.PalmFaceImageDecode;
    if (!sample || !sample.pendingRecognitionImage || !file || file.size > 8 * 1024 * 1024 || !runtime || typeof runtime.readDataUrl !== "function") return false;
    const dataUrl = await runtime.readDataUrl(file);
    if (!dataUrl.startsWith("data:image/")) return false;
    sample.pendingRecognitionImage.dataUrl = dataUrl;
    sample.pendingRecognitionImage.source = "original_upload";
    if (sample.imageDecode) sample.imageDecode.endpointEncoding = file.type || "image/original";
    return true;
  }

  function analyzeImage(canvas, mode) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const { width, height } = canvas;
    const data = context.getImageData(0, 0, width, height).data;
    const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 320));
    const gray = new Float32Array(width * height);
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    const brightnessValues = [];
    let skinPixels = 0;
    let skinLeftPixels = 0;
    let skinRightPixels = 0;
    let skinLowerLeftPixels = 0;
    let skinLowerRightPixels = 0;
    let skinMinX = width;
    let skinMinY = height;
    let skinMaxX = 0;
    let skinMaxY = 0;

    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const value = 0.299 * r + 0.587 * g + 0.114 * b;
        gray[y * width + x] = value;
        red += r;
        green += g;
        blue += b;
        brightnessValues.push(value / 255);
        if (skinLikelihood(r, g, b) > 0.52) {
          skinPixels += 1;
          if (x < width / 2) skinLeftPixels += 1;
          else skinRightPixels += 1;
          if (y > height * 0.38) {
            if (x < width / 2) skinLowerLeftPixels += 1;
            else skinLowerRightPixels += 1;
          }
          skinMinX = Math.min(skinMinX, x);
          skinMinY = Math.min(skinMinY, y);
          skinMaxX = Math.max(skinMaxX, x);
          skinMaxY = Math.max(skinMaxY, y);
        }
        count += 1;
      }
    }

    const avgRed = red / Math.max(1, count);
    const avgGreen = green / Math.max(1, count);
    const avgBlue = blue / Math.max(1, count);
    const brightness = average(brightnessValues);
    const contrast = Math.sqrt(average(brightnessValues.map((value) => (value - brightness) ** 2)));
    const warmth = clamp((avgRed - avgBlue + avgGreen * 0.12) / 255, 0, 1);
    const redness = clamp((avgRed - avgGreen) / 90, 0, 1);

    let edgeCount = 0;
    let edgeTotal = 0;
    let verticalEnergy = 0;
    let horizontalEnergy = 0;
    let diagonalEnergy = 0;
    let leftEdgeEnergy = 0;
    let rightEdgeEnergy = 0;
    let symmetryDiff = 0;
    let symmetryCount = 0;

    for (let y = sampleStep; y < height - sampleStep; y += sampleStep) {
      for (let x = sampleStep; x < width - sampleStep; x += sampleStep) {
        const left = pixelGray(data, width, x - sampleStep, y);
        const right = pixelGray(data, width, x + sampleStep, y);
        const up = pixelGray(data, width, x, y - sampleStep);
        const down = pixelGray(data, width, x, y + sampleStep);
        const gx = right - left;
        const gy = down - up;
        const magnitude = Math.sqrt(gx * gx + gy * gy) / 255;
        if (magnitude > 0.08) edgeCount += 1;
        edgeTotal += 1;

        const nx = x / width;
        const ny = y / height;
        const centerWeight = mode === "palm"
          ? regionWeight(nx, ny, 0.16, 0.78, 0.18, 0.9)
          : regionWeight(nx, ny, 0.22, 0.78, 0.12, 0.9);
        verticalEnergy += Math.abs(gx) * centerWeight;
        horizontalEnergy += Math.abs(gy) * centerWeight;
        diagonalEnergy += Math.min(Math.abs(gx), Math.abs(gy)) * centerWeight;
        if (mode === "face") {
          const sideEnergy = magnitude * centerWeight;
          if (nx < 0.5) leftEdgeEnergy += sideEnergy;
          else rightEdgeEnergy += sideEnergy;
        }

        const mirrorX = width - x - 1;
        if (mode === "face" && mirrorX > 0 && mirrorX < width) {
          const a = pixelGray(data, width, x, y);
          const b = pixelGray(data, width, mirrorX, y);
          symmetryDiff += Math.abs(a - b) / 255;
          symmetryCount += 1;
        }
      }
    }

    const edgeDensity = edgeCount / Math.max(1, edgeTotal);
    const energyTotal = Math.max(1, verticalEnergy + horizontalEnergy + diagonalEnergy);
    const symmetry = mode === "face" ? 1 - clamp(symmetryDiff / Math.max(1, symmetryCount) * 1.9, 0, 1) : 0;
    const lineClarity = clamp(edgeDensity * 2.2 + contrast * 0.9, 0, 1);
    const textureBusy = clamp(edgeDensity * 1.7, 0, 1);
    const skinCoverage = skinPixels / Math.max(1, count);
    const subject = subjectFromSkin(width, height, skinPixels, count, skinMinX, skinMinY, skinMaxX, skinMaxY);
    const metrics = {
      brightness,
      contrast,
      warmth,
      redness,
      skinCoverage,
      subject,
      subjectAreaRatio: subject ? subject.areaRatio : 0,
      subjectCenteredness: subject ? subject.centeredness : 0,
      edgeDensity,
      lineClarity,
      textureBusy,
      symmetry,
      verticalRatio: verticalEnergy / energyTotal,
      horizontalRatio: horizontalEnergy / energyTotal,
      diagonalRatio: diagonalEnergy / energyTotal
    };
    metrics.quality = imageQuality(metrics, mode);
    metrics.rawSuggestedType = suggestSampleType(mode, metrics);
    metrics.typeCalibration = calibratedSampleType(mode, metrics.rawSuggestedType);
    metrics.suggestedType = metrics.typeCalibration.type;
    metrics.handOrientation = mode === "palm" ? estimateHandOrientation(metrics, {
      skinLeftPixels,
      skinRightPixels,
      skinLowerLeftPixels,
      skinLowerRightPixels
    }) : null;
    metrics.faceOrientation = mode === "face" ? estimateFaceOrientation(metrics, {
      skinLeftPixels,
      skinRightPixels,
      leftEdgeEnergy,
      rightEdgeEnergy
    }) : null;
    metrics.warnings = imageWarnings(metrics);
    return metrics;
  }

  function calibratedSampleType(mode, rawType) {
    const calibration = routeCalibrationSnapshot();
    const corrections = calibration.typeCorrections[mode] || {};
    const prefix = `${rawType}->`;
    const candidates = Object.entries(corrections)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, count]) => ({ type: key.slice(prefix.length), count }))
      .filter((item) => item.type && item.type !== rawType)
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
    const winner = candidates[0];
    return {
      rawType,
      type: winner ? winner.type : rawType,
      applied: Boolean(winner),
      corrections: winner ? winner.count : 0
    };
  }

  function imageQuality(metrics, mode) {
    const brightnessFit = 1 - clamp(Math.abs(metrics.brightness - 0.54) * 2.2, 0, 1);
    const contrastFit = clamp(metrics.contrast * 3.6, 0, 1);
    const lineFit = clamp(metrics.lineClarity * 1.25, 0, 1);
    const edgeFit = clamp(metrics.edgeDensity * 3, 0, 1);
    const symmetryFit = mode === "face" ? clamp(metrics.symmetry, 0, 1) : 0.65;
    const subjectFit = clamp(metrics.subjectAreaRatio * 2.3, 0, 1) * 0.6 + clamp(metrics.subjectCenteredness, 0, 1) * 0.4;
    const skinFit = clamp(metrics.skinCoverage * 3.2, 0, 1);
    return clamp(
      brightnessFit * 0.18 +
      contrastFit * 0.18 +
      lineFit * 0.22 +
      edgeFit * 0.14 +
      symmetryFit * 0.08 +
      subjectFit * 0.12 +
      skinFit * 0.08,
      0,
      1
    );
  }

  function addSample(mode, name, type, metrics, routeEvidence = null) {
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    const modelInput = buildModelInput(mode, name, type, metrics, routeEvidence);
    const modelResult = normalizeHeuristicResult(modelInput, metrics);
    const resolvedType = type === "auto" ? modelResult.suggestedType : type;
    applySampleWarnings(mode, resolvedType, metrics, routeEvidence, modelResult);
    const sample = {
      id: `${mode}-${Date.now()}-${samples.length}`,
      name,
      type: resolvedType,
      userType: type,
      suggestedType: modelResult.suggestedType,
      handOrientation: mode === "palm" ? metrics.handOrientation : null,
      faceOrientation: mode === "face" ? metrics.faceOrientation : null,
      metrics,
      quality: metrics.quality,
      warnings: modelResult.warnings,
      overlayRegions: modelResult.overlayRegions,
      routeEvidence,
      modelInput,
      modelResult,
      modelVersion: recognitionAdapter.version,
      geometryCorrections: [],
      creaseGeometryEdits: [],
      rotation: 0,
      rotationCorrections: [],
      preprocessCorrections: [],
      subjectSelection: null,
      subjectSelectionHistory: [],
      recognitionRevision: 0,
      recognitionResultAudit: null,
      recognitionResultHistory: [],
      imageDecode: null,
      sampleProvenance: normalizeSampleProvenance(),
      thumbnail: null,
      label: sampleTypeLabel(mode, resolvedType)
    };
    samples.push(sample);
    renderModelDebug(sample);
    return sample;
  }

  function applySampleWarnings(mode, resolvedType, metrics, routeEvidence, modelResult) {
    const warnings = Array.isArray(modelResult.warnings) ? [...modelResult.warnings] : [];
    const addWarning = (warning) => {
      if (warning && !warnings.includes(warning)) warnings.push(warning);
    };
    if (routeEvidence && routeEvidence.confidence < 0.62) addWarning("通用分流需复核");
    if (mode === "palm") addWarning(palmSideMismatchWarning(metrics.handOrientation, currentPalmSide()));
    if (mode === "face") addWarning(faceOrientationMismatchWarning(metrics.faceOrientation, resolvedType));
    modelResult.warnings = warnings;
    return warnings;
  }

  function buildModelInput(mode, name, userType, metrics, routeEvidence = null) {
    return {
      contractVersion: recognitionAdapter.contractVersion,
      mode,
      sourceName: name,
      userType,
      routeEvidence,
      imageSignals: {
        brightness: roundMetric(metrics.brightness),
        contrast: roundMetric(metrics.contrast),
        warmth: roundMetric(metrics.warmth),
        redness: roundMetric(metrics.redness),
        skinCoverage: roundMetric(metrics.skinCoverage),
        subjectAreaRatio: roundMetric(metrics.subjectAreaRatio),
        subjectCenteredness: roundMetric(metrics.subjectCenteredness),
        edgeDensity: roundMetric(metrics.edgeDensity),
        lineClarity: roundMetric(metrics.lineClarity),
        textureBusy: roundMetric(metrics.textureBusy),
        symmetry: roundMetric(metrics.symmetry)
      },
      subject: metrics.subject,
      handOrientation: mode === "palm" ? metrics.handOrientation : null,
      faceOrientation: mode === "face" ? metrics.faceOrientation : null,
      rawHeuristicType: metrics.rawSuggestedType || metrics.suggestedType,
      typeCalibration: metrics.typeCalibration || null
    };
  }

  function normalizeHeuristicResult(input, metrics) {
    const suggestedType = metrics.suggestedType || "mixed";
    const trainingProfile = geometryTrainingProfile(input.mode);
    const keypoints = heuristicKeypoints(input.mode, suggestedType, metrics, trainingProfile);
    const lineSegments = heuristicLineSegments(input.mode, suggestedType, metrics, keypoints, trainingProfile);
    const prioritySignals = heuristicPrioritySignals(input.mode, suggestedType, metrics, lineSegments);
    return {
      contractVersion: recognitionAdapter.contractVersion,
      adapter: recognitionAdapter.name,
      modelVersion: recognitionAdapter.version,
      mode: input.mode,
      suggestedType,
      confidence: roundMetric(metrics.quality),
      warnings: metrics.warnings || [],
      subject: metrics.subject,
      handOrientation: input.mode === "palm" ? metrics.handOrientation || null : null,
      faceOrientation: input.mode === "face" ? metrics.faceOrientation || null : null,
      regions: capabilityRegionKeys(input.mode, suggestedType),
      keypoints,
      lineSegments,
      creaseCandidates: [],
      creaseCenterlines: [],
      creasePolylines: [],
      creaseDetection: null,
      prioritySignals,
      trainingProfile,
      overlayRegions: overlayRegions(input.mode, suggestedType),
      explanation: modelExplanation(input.mode, suggestedType, metrics)
    };
  }

  function heuristicKeypoints(mode, type, metrics, trainingProfile = null) {
    const box = normalizedSubjectBox(metrics);
    const confidence = roundMetric(clamp(Number(metrics.quality || 0) * 0.72 + Number(metrics.subjectCenteredness || 0) * 0.28, 0.18, 0.92));
    const point = (key, x, y, role = "geometry") => {
      const offset = geometryOffsetFor(trainingProfile, "keypoint", key);
      return {
        key,
        role,
        x: roundMetric(clamp(box.x + box.width * x + offset.dx, 0, 1)),
        y: roundMetric(clamp(box.y + box.height * y + offset.dy, 0, 1)),
        confidence,
        source: offset.count ? "heuristic_geometry_trained" : "heuristic_geometry",
        trainingOffset: offset.count ? offset : null
      };
    };
    if (mode === "palm") {
      return [
        point("palm_center", 0.5, 0.55, "anchor"),
        point("wrist_center", 0.5, 0.96, "anchor"),
        point("thumb_base", 0.18, 0.62, "mount"),
        point("index_base", 0.35, 0.2, "finger_base"),
        point("middle_base", 0.5, 0.18, "finger_base"),
        point("ring_base", 0.64, 0.22, "finger_base"),
        point("little_base", 0.78, 0.3, "finger_base"),
        point("sun_mount", 0.64, 0.34, "detail_zone"),
        point("mercury_mount", 0.79, 0.42, "detail_zone"),
        point("helper_zone", 0.28, 0.7, "detail_zone")
      ].filter((item) => detailPointAllowed(type, item.key));
    }
    return [
      point("face_top", 0.5, 0.05, "anchor"),
      point("hairline_center", 0.5, 0.08, "measure"),
      point("brow_center", 0.5, 0.32, "feature"),
      point("left_eye", 0.36, 0.39, "feature"),
      point("right_eye", 0.64, 0.39, "feature"),
      point("nose_bridge", 0.5, 0.47, "feature"),
      point("nose_tip", 0.5, 0.57, "feature"),
      point("nose_base", 0.5, 0.61, "measure"),
      point("upper_lip", 0.5, 0.69, "measure"),
      point("mouth_center", 0.5, 0.72, "feature"),
      point("lower_lip", 0.5, 0.75, "measure"),
      point("jaw_center", 0.5, 0.9, "measure"),
      point("profile_bridge", 0.68, 0.44, "profile")
    ].filter((item) => detailPointAllowed(type, item.key));
  }

  function normalizedSubjectBox(metrics) {
    const box = metrics && metrics.subject && metrics.subject.box ? metrics.subject.box : null;
    if (box && ["x", "y", "width", "height"].every((key) => Number.isFinite(Number(box[key])))) {
      return {
        x: clamp(Number(box.x), 0, 1),
        y: clamp(Number(box.y), 0, 1),
        width: clamp(Number(box.width), 0.05, 1),
        height: clamp(Number(box.height), 0.05, 1)
      };
    }
    return { x: 0.14, y: 0.08, width: 0.72, height: 0.84 };
  }

  function detailPointAllowed(type, key) {
    const map = {
      palm_sun_wealth_detail: new Set(["sun_mount", "mercury_mount", "ring_base", "little_base"]),
      palm_helper_detail: new Set(["thumb_base", "helper_zone", "palm_center", "wrist_center"]),
      palm_main_detail: new Set(["palm_center", "thumb_base", "index_base", "middle_base", "ring_base", "little_base", "wrist_center"]),
      eyes: new Set(["brow_center", "left_eye", "right_eye"]),
      nose: new Set(["nose_bridge", "nose_tip", "nose_base"]),
      mouth_jaw: new Set(["nose_base", "upper_lip", "mouth_center", "lower_lip", "jaw_center"]),
      forehead: new Set(["face_top", "hairline_center", "brow_center"]),
      face_side: new Set(["face_top", "hairline_center", "profile_bridge", "nose_tip", "nose_base", "upper_lip", "mouth_center", "lower_lip", "jaw_center"])
    };
    return !map[type] || map[type].has(key);
  }

  function heuristicLineSegments(mode, type, metrics, keypoints = [], trainingProfile = null) {
    const box = normalizedSubjectBox(metrics);
    const baseConfidence = roundMetric(clamp(Number(metrics.lineClarity || 0) * 0.65 + Number(metrics.quality || 0) * 0.35, 0.12, 0.9));
    const line = (key, label, x1, y1, x2, y2, confidence = baseConfidence) => {
      const startOffset = geometryOffsetFor(trainingProfile, "segment", key, "start");
      const endOffset = geometryOffsetFor(trainingProfile, "segment", key, "end");
      const trained = startOffset.count || endOffset.count;
      return {
        key,
        label,
        x1: roundMetric(clamp(box.x + box.width * x1 + startOffset.dx, 0, 1)),
        y1: roundMetric(clamp(box.y + box.height * y1 + startOffset.dy, 0, 1)),
        x2: roundMetric(clamp(box.x + box.width * x2 + endOffset.dx, 0, 1)),
        y2: roundMetric(clamp(box.y + box.height * y2 + endOffset.dy, 0, 1)),
        confidence: roundMetric(clamp(confidence, 0.05, 0.95)),
        source: trained ? "heuristic_geometry_trained" : "heuristic_geometry",
        trainingOffset: trained ? { start: startOffset, end: endOffset } : null
      };
    };
    if (mode === "palm") {
      return [
        line("life_line", "生命线", 0.24, 0.28, 0.35, 0.85, baseConfidence),
        line("head_line", "智慧线", 0.26, 0.46, 0.75, 0.55, baseConfidence * 0.95),
        line("heart_line", "感情线", 0.22, 0.34, 0.78, 0.38, baseConfidence * 0.9),
        line("fate_line", "命运线", 0.52, 0.86, 0.5, 0.32, baseConfidence * 0.82),
        line("sun_line", "太阳线", 0.64, 0.72, 0.64, 0.32, baseConfidence * 0.7),
        line("wealth_lines", "财运纹", 0.77, 0.65, 0.8, 0.38, baseConfidence * 0.68),
        line("helper_lines", "贵人线", 0.32, 0.82, 0.28, 0.52, baseConfidence * 0.72)
      ].filter((item) => detailLineAllowed(type, item.key));
    }
    const symmetry = Number(metrics.symmetry || 0);
    return [
      line("three_courts_upper", "上庭参考", 0.28, 0.31, 0.72, 0.31, baseConfidence),
      line("three_courts_middle", "中庭下界", 0.3, 0.61, 0.7, 0.61, baseConfidence * 0.96),
      line("brow_eye_axis", "眉眼轴", 0.3, 0.4, 0.7, 0.4, baseConfidence * (0.85 + symmetry * 0.15)),
      line("nose_axis", "鼻部中轴", 0.5, 0.43, 0.5, 0.62, baseConfidence),
      line("mouth_axis", "口部横轴", 0.36, 0.72, 0.64, 0.72, baseConfidence * 0.92),
      line("lip_band_axis", "唇带参考", 0.5, 0.69, 0.5, 0.75, baseConfidence * 0.86),
      line("chin_support_axis", "下巴支撑段", 0.5, 0.75, 0.5, 0.9, baseConfidence * 0.86),
      line("jaw_axis", "下庭承托", 0.38, 0.88, 0.62, 0.88, baseConfidence * 0.86),
      line("profile_axis", "侧面轮廓", 0.66, 0.18, 0.7, 0.88, baseConfidence * 0.78)
    ].filter((item) => detailLineAllowed(type, item.key));
  }

  function detailLineAllowed(type, key) {
    const map = {
      palm_sun_wealth_detail: new Set(["sun_line", "wealth_lines"]),
      palm_helper_detail: new Set(["helper_lines", "life_line"]),
      palm_main_detail: new Set(["life_line", "head_line", "heart_line", "fate_line"]),
      eyes: new Set(["brow_eye_axis"]),
      nose: new Set(["nose_axis"]),
      mouth_jaw: new Set(["three_courts_middle", "mouth_axis", "lip_band_axis", "chin_support_axis", "jaw_axis"]),
      forehead: new Set(["three_courts_upper"]),
      face_side: new Set(["profile_axis", "three_courts_middle", "nose_axis", "mouth_axis", "lip_band_axis", "chin_support_axis", "jaw_axis"])
    };
    return !map[type] || map[type].has(key);
  }

  function heuristicPrioritySignals(mode, type, metrics, lineSegments = []) {
    const signals = [];
    const confidenceFor = (keys) => {
      const matches = lineSegments.filter((item) => keys.includes(item.key));
      return matches.length ? Math.max(...matches.map((item) => Number(item.confidence || 0))) : 0;
    };
    const add = (key, targetType, weight, reason) => {
      signals.push({
        key,
        targetType,
        weight: roundMetric(clamp(weight, 0, 1)),
        reason,
        source: "heuristic_geometry"
      });
    };
    if (mode === "palm") {
      const main = confidenceFor(["life_line", "head_line", "heart_line", "fate_line"]);
      const sunWealth = confidenceFor(["sun_line", "wealth_lines"]);
      const helper = confidenceFor(["helper_lines"]);
      if (main && main < 0.55) add("main_line_closeup", "palm_main_detail", 0.75 - main, "主线线段置信不足，优先补三大主线近照");
      if (sunWealth < 0.5) add("sun_wealth_closeup", "palm_sun_wealth_detail", 0.82 - sunWealth, "太阳线/财运纹线段置信不足，优先补小指下方近照");
      if (helper < 0.48) add("helper_closeup", "palm_helper_detail", 0.76 - helper, "贵人线区域置信不足，优先补拇指根部近照");
    } else {
      const browEye = confidenceFor(["brow_eye_axis"]);
      const nose = confidenceFor(["nose_axis"]);
      const mouth = confidenceFor(["mouth_axis", "jaw_axis"]);
      const profile = confidenceFor(["profile_axis"]);
      if (browEye < 0.52) add("brow_eye_closeup", "eyes", 0.72 - browEye, "眉眼关键线置信不足，优先补眉眼局部");
      if (nose < 0.52) add("nose_closeup", "nose", 0.72 - nose, "鼻部中轴置信不足，优先补鼻部局部");
      if (mouth < 0.5) add("mouth_jaw_closeup", "mouth_jaw", 0.7 - mouth, "口下巴承托线置信不足，优先补下庭局部");
      if (type === "face_side" && profile < 0.5) add("profile_retake", "face_side", 0.68 - profile, "侧面轮廓线置信不足，优先重拍侧脸");
    }
    return signals.filter((item) => item.weight > 0.12).sort((a, b) => b.weight - a.weight);
  }

  function modelExplanation(mode, type, metrics) {
    const label = sampleTypeLabel(mode, type);
    const subjectText = metrics.subject ? "主体框稳定" : "主体框不稳定";
    const warningText = metrics.warnings.length ? `风险 ${metrics.warnings.join("、")}` : "无明显拍摄风险";
    return `${label}；${subjectText}；质量 ${percent(metrics.quality)}；${warningText}`;
  }

  function capabilityRegionKeys(mode, type) {
    const specs = mode === "palm" ? palmCapabilitySpecs() : faceCapabilitySpecs();
    return specs
      .filter((item) => item.types.includes(type))
      .map((item) => item.key);
  }

  function renderModelDebug(sample) {
    const target = $("#model-debug");
    if (!target) return;
    $("#model-status").textContent = sample.modelVersion;
    target.value = JSON.stringify({
      input: sample.modelInput,
      result: sample.modelResult
    }, null, 2);
  }

  async function importModelResults(fileList) {
    const files = Array.from(fileList || []);
    let applied = 0;
    let failed = 0;
    let semanticRejected = 0;
    for (const file of files) {
      try {
        const parsed = JSON.parse(await file.text());
        const results = normalizeImportedModelPayload(parsed);
        for (const result of results) {
          semanticRejected += Number(result.semanticAnnotationGate && result.semanticAnnotationGate.rejectedCount || 0);
          if (applyImportedModelResult(result)) applied += 1;
          else failed += 1;
        }
      } catch (error) {
        failed += 1;
      }
    }
    const status = $("#model-import-status");
    if (status) {
      status.textContent = applied
        ? `已应用 ${applied} 条${semanticRejected ? `，语义拒绝 ${semanticRejected} 项` : ""}${failed ? `，失败 ${failed} 条` : ""}`
        : "未应用模型结果";
    }
  }

  function normalizeImportedModelPayload(payload) {
    if (Array.isArray(payload)) {
      return payload.map(normalizeImportedModelResult).filter(Boolean);
    }
    if (payload && Array.isArray(payload.results)) {
      return payload.results.map(normalizeImportedModelResult).filter(Boolean);
    }
    if (payload && Array.isArray(payload.modelResults)) {
      return payload.modelResults.map(normalizeImportedModelResult).filter(Boolean);
    }
    if (payload && payload.result && payload.result !== payload) {
      return normalizeImportedModelPayload(payload.result);
    }
    if (payload && payload.output && payload.output !== payload) {
      return normalizeImportedModelPayload(payload.output);
    }
    return [normalizeImportedModelResult(payload)].filter(Boolean);
  }

  function normalizeModeMismatch(value, requestedMode) {
    if (!value || value.detected !== true || !["palm", "face"].includes(requestedMode)) return null;
    const suggestedMode = ["palm", "face"].includes(value.suggestedMode) ? value.suggestedMode : "";
    if (!suggestedMode || suggestedMode === requestedMode) return null;
    const suggestedLabel = suggestedMode === "palm" ? "手相" : "面相";
    const nativeSource = value.source === "apple_vision_cross_mode_probe";
    return {
      detected: true,
      requestedMode,
      suggestedMode,
      label: String(value.label || `原生探测建议改用${suggestedLabel}入口`).slice(0, 120),
      confidence: roundMetric(clamp(Number(value.confidence || 0), 0, 1)),
      keypointCount: Math.max(0, Math.min(256, Number(value.keypointCount || 0) || 0)),
      subjectCandidateCount: Math.max(0, Math.min(16, Number(value.subjectCandidateCount || 0) || 0)),
      source: nativeSource ? "apple_vision_cross_mode_probe" : "external_mode_mismatch",
      sourceRefs: nativeSource ? suggestedMode === "palm" ? ["web.apple-hand#output"] : ["web.apple-face#output"] : [],
      reviewRequired: true,
      boundaries: ["wrong_mode_geometry_suppressed", "manual_or_universal_route_correction_required"]
    };
  }

  function normalizeNoTargetEvidence(value, requestedMode, adapter) {
    if (!value || value.confirmed !== true || !["palm", "face"].includes(requestedMode)) return null;
    const unresolved = value.status === "target_unresolved";
    if (!unresolved && value.status !== "no_supported_target") return null;
    const expectedAdapter = unresolved ? "apple-vision-target-unresolved" : "apple-vision-no-target";
    const expectedSource = unresolved ? "apple_vision_primary_negative" : "apple_vision_dual_negative";
    const trusted = adapter === expectedAdapter && value.source === expectedSource;
    return {
      confirmed: true,
      status: value.status,
      requestedMode,
      requestedType: String(value.requestedType || "").slice(0, 48),
      label: String(value.label || "原生手部与面部检测均未找到可分析目标").slice(0, 120),
      trustedForAnalysisGate: trusted,
      source: trusted ? expectedSource : "external_no_target_claim",
      sourceRefs: trusted ? unresolved ? [requestedMode === "palm" ? "web.apple-hand#output" : "web.apple-face#output"] : ["web.apple-hand#output", "web.apple-face#output"] : [],
      reviewRequired: true,
      boundaries: [unresolved ? "no_heuristic_geometry_after_primary_negative" : "no_heuristic_geometry_after_dual_negative", ...(unresolved ? ["alternate_probe_unavailable"] : []), "whole_target_types_only", "retake_or_manual_review_required"]
    };
  }

  function normalizeFaceCaptureQuality(value, mode, adapter) {
    if (mode !== "face" || !value || typeof value !== "object") return null;
    const score = Number(value.score);
    const available = value.available === true && Number.isFinite(score);
    const nativeSource = adapter === "apple-vision-native" && value.source === "apple_vision_face_capture_quality";
    const normalizedScore = available ? roundMetric(clamp(score, 0, 1)) : null;
    const threshold = faceProportionThresholds.minimumNativeFaceCaptureQuality;
    return {
      attempted: value.attempted === true,
      available,
      score: normalizedScore,
      requestRevision: Math.max(1, Math.min(8, Number(value.requestRevision || 1))),
      threshold,
      decision: !available ? "unavailable" : normalizedScore >= threshold ? "usable" : "retake",
      reviewRequired: available && normalizedScore < threshold,
      trustedForMeasurementGate: nativeSource,
      source: nativeSource ? "apple_vision_face_capture_quality" : "external_face_capture_quality",
      sourceRefs: nativeSource ? ["web.apple-face-quality#score", "web.nist-face-quality#factors"] : [],
      failure: available ? "" : String(value.failure || "face_capture_quality_unavailable").slice(0, 80),
      boundaries: ["capture_suitability_only", "project_specific_threshold", "compare_same_person_captures", "no_beauty_health_personality_or_fortune_inference"]
    };
  }

  function faceCaptureQualityForSample(sample) {
    const value = sample && sample.modelResult && sample.modelResult.faceCaptureQuality;
    return value && value.available === true && value.trustedForMeasurementGate === true ? value : null;
  }

  function semanticAnnotationGate(source, mode) {
    const modelVersion = String(source.modelVersion || source.version || "external-v1");
    const scope = mode === "palm" ? "palm_line_annotations" : "face_zone_annotations";
    const expected = mode === "palm" ? source.lineAnnotations : source.zoneAnnotations;
    const crossed = mode === "palm" ? source.zoneAnnotations : source.lineAnnotations;
    const expectedCount = Array.isArray(expected) ? expected.length : 0;
    const crossedCount = Array.isArray(crossed) ? crossed.length : 0;
    const entry = semanticModelRegistry.find((item) => item.modelVersion === modelVersion && item.scopes.includes(scope));
    const approved = Boolean(entry);
    return {
      approved,
      scope,
      modelVersion,
      registryId: entry ? entry.id : null,
      submittedCount: expectedCount + crossedCount,
      acceptedCount: approved ? expectedCount : 0,
      rejectedCount: crossedCount + (approved ? 0 : expectedCount),
      source: "local_semantic_model_registry",
      boundaries: ["geometry_import_allowed_without_semantic_trust", "local_registry_entry_requires_independent_holdout_evidence"]
    };
  }

  function normalizeImportedModelResult(raw) {
    const source = raw && raw.payload ? raw.payload : raw;
    if (!source || typeof source !== "object") return null;
    const mode = source.mode || source.type;
    if (!["palm", "face"].includes(mode)) return null;
    const adapter = source.adapter || "external-model";
    const sourceSuggestedType = source.suggestedType || (source.type && source.type !== mode ? source.type : "mixed");
    const faceOrientation = mode === "face" ? normalizeFaceOrientation(source.faceOrientation) : null;
    const suggestedType = modelSuggestedType(mode, sourceSuggestedType, faceOrientation);
    const regions = Array.isArray(source.regions)
      ? source.regions
      : Array.isArray(source.modelRegions)
        ? source.modelRegions
        : [];
    const modeMismatch = normalizeModeMismatch(source.modeMismatch, mode);
    const noTargetEvidence = modeMismatch ? null : normalizeNoTargetEvidence(source.noTargetEvidence, mode, adapter);
    const noTargetBlocked = Boolean(noTargetEvidence && noTargetEvidence.trustedForAnalysisGate);
    const analysisBlocked = Boolean(modeMismatch || noTargetBlocked);
    const semanticGate = semanticAnnotationGate(source, mode);
    const warnings = Array.isArray(source.warnings) ? source.warnings.slice() : [];
    if (semanticGate.rejectedCount) {
      warnings.push(`外部传统语义未在本地验证注册表登记，已忽略 ${semanticGate.rejectedCount} 项；${analysisBlocked ? "当前识别已阻断，几何不进入分析" : "几何结果仍保留"}`);
    }
    return {
      contractVersion: Number(source.contractVersion || recognitionAdapter.contractVersion),
      adapter,
      modelVersion: source.modelVersion || source.version || "external-v1",
      mode,
      sampleId: typeof source.sampleId === "string" ? source.sampleId : null,
      recognitionRevision: Number.isInteger(Number(source.recognitionRevision)) && Number(source.recognitionRevision) >= 0
        ? Number(source.recognitionRevision)
        : null,
      suggestedMode: modeMismatch ? modeMismatch.suggestedMode : mode,
      modeMismatch,
      noTargetEvidence,
      recognitionBlocked: Boolean(analysisBlocked || source.recognitionBlocked),
      suggestedType,
      confidence: roundMetric(clamp(Number(source.confidence || 0), 0, 1)),
      warnings,
      subject: analysisBlocked ? null : source.subject || null,
      subjectCandidates: analysisBlocked ? [] : normalizeImportedSubjectCandidates(source.subjectCandidates, mode),
      handOrientation: analysisBlocked ? null : normalizeHandOrientation(source.handOrientation),
      handPoseSuitability: analysisBlocked ? null : normalizeHandPoseSuitability(source.handPoseSuitability, mode, adapter),
      palmSurfaceVerification: analysisBlocked ? null : normalizePalmSurfaceVerification(source.palmSurfaceVerification, mode, adapter),
      faceOrientation: analysisBlocked ? null : faceOrientation,
      regions: analysisBlocked ? [] : regions.filter(Boolean),
      lineAnnotations: !analysisBlocked && mode === "palm" && semanticGate.approved ? normalizeModelAnnotations(source.lineAnnotations) : [],
      zoneAnnotations: !analysisBlocked && mode === "face" && semanticGate.approved ? normalizeModelAnnotations(source.zoneAnnotations) : [],
      semanticAnnotationGate: semanticGate,
      overlayRegions: analysisBlocked ? [] : Array.isArray(source.overlayRegions) ? source.overlayRegions : [],
      keypoints: analysisBlocked ? [] : faceThirdsRuntime.sanitizeKeypoints(source.keypoints),
      lineSegments: analysisBlocked ? [] : Array.isArray(source.lineSegments) ? source.lineSegments : [],
      creaseCandidates: analysisBlocked ? [] : normalizeImportedCreaseCandidates(source.creaseCandidates),
      creaseCenterlines: analysisBlocked ? [] : normalizeImportedCreaseCenterlines(source.creaseCenterlines),
      creasePolylines: analysisBlocked ? [] : normalizeImportedCreasePolylines(source.creasePolylines),
      creaseDetection: !analysisBlocked && mode === "palm" && source.creaseDetection && typeof source.creaseDetection === "object"
        ? { ...source.creaseDetection, semanticStatus: "unclassified", namingAllowed: false }
        : null,
      detailDetection: !analysisBlocked && mode === "face" && source.detailDetection && typeof source.detailDetection === "object"
        ? { ...source.detailDetection, semanticStatus: "unclassified", namingAllowed: false }
        : null,
      prioritySignals: analysisBlocked ? [] : Array.isArray(source.prioritySignals) ? source.prioritySignals : [],
      faceProportions: !analysisBlocked && mode === "face" && source.faceProportions ? source.faceProportions : null,
      faceCaptureQuality: !analysisBlocked ? normalizeFaceCaptureQuality(source.faceCaptureQuality, mode, adapter) : null,
      faceObservationCandidates: !analysisBlocked && mode === "face" ? faceObservationRuntime.normalize(source.faceObservationCandidates) : [],
      nativeVision: source.nativeVision && typeof source.nativeVision === "object" ? source.nativeVision : null,
      recognitionCache: source.recognitionCache && typeof source.recognitionCache === "object" ? source.recognitionCache : null,
      explanation: source.explanation || "外部模型导入"
    };
  }

  function normalizeImportedSubjectCandidates(items, mode) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 4).map((item, index) => {
      const box = item && item.box;
      if (!box || ![box.x, box.y, box.width, box.height].every((value) => Number.isFinite(Number(value)))) return null;
      return {
        index: Number.isInteger(item.index) ? item.index : index,
        selected: Boolean(item.selected),
        confidence: roundMetric(clamp(Number(item.confidence || 0), 0, 1)),
        box: {
          x: roundMetric(clamp(Number(box.x), 0, 1)),
          y: roundMetric(clamp(Number(box.y), 0, 1)),
          width: roundMetric(clamp(Number(box.width), 0, 1)),
          height: roundMetric(clamp(Number(box.height), 0, 1))
        },
        side: mode === "palm" && ["left", "right", "unknown"].includes(item.side) ? item.side : null,
        pose: mode === "face" && typeof item.pose === "string" ? item.pose : null,
        pointCount: Math.max(0, Number(item.pointCount || 0)),
        source: item.source || "model_adapter",
        reviewRequired: items.length > 1
      };
    }).filter(Boolean);
  }

  function normalizeImportedCreaseCandidates(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 16).map((item, index) => {
      if (!item || !Array.isArray(item.points)) return null;
      const points = item.points.slice(0, 28).map((point) => {
        const x = Number(point && point.x);
        const y = Number(point && point.y);
        if (!isUnitCoordinate(x) || !isUnitCoordinate(y)) return null;
        return { x: roundMetric(x), y: roundMetric(y) };
      }).filter(Boolean);
      if (points.length < 2) return null;
      const confidence = roundMetric(clamp(Number(item.confidence || 0), 0, 0.79));
      return {
        ...item,
        key: `crease_candidate_${index + 1}`,
        label: "未分类掌褶/暗纹候选",
        points,
        confidence,
        source: item.source || "model_adapter",
        geometry: item.geometry || "edge_contour_fragment",
        semanticKey: null,
        semanticStatus: "unclassified",
        reviewRequired: true,
        namingAllowed: false
      };
    }).filter(Boolean);
  }

  function normalizeImportedCreaseCenterlines(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 12).map((item, index) => {
      if (!item || !Array.isArray(item.points)) return null;
      const points = item.points.slice(0, 28).map((point) => {
        const x = Number(point && point.x);
        const y = Number(point && point.y);
        if (!isUnitCoordinate(x) || !isUnitCoordinate(y)) return null;
        return { x: roundMetric(x), y: roundMetric(y) };
      }).filter(Boolean);
      if (points.length < 2) return null;
      return {
        ...item,
        key: `crease_centerline_${index + 1}`,
        label: "未分类掌褶中心线候选",
        points,
        confidence: roundMetric(clamp(Number(item.confidence || 0), 0, 0.76)),
        source: item.source || "model_adapter",
        geometry: "skeleton_centerline",
        semanticKey: null,
        semanticStatus: "unclassified",
        reviewRequired: true,
        namingAllowed: false
      };
    }).filter(Boolean);
  }

  function palmCreaseSemanticSpec(key) {
    return palmCreaseSemanticCatalog.find((item) => item.key === key) || null;
  }

  function normalizeCreaseSemanticReview(polyline) {
    const source = polyline && polyline.semanticReview && typeof polyline.semanticReview === "object"
      ? polyline.semanticReview
      : {};
    const candidateKey = String(source.candidateKey || polyline && polyline.semanticKey || "");
    const spec = palmCreaseSemanticSpec(candidateKey);
    const status = ["proposed", "confirmed", "invalidated"].includes(source.status) ? source.status : "unclassified";
    const trustedSource = source.source === "manual_two_stage_traditional_review";
    if (!spec || !trustedSource || status === "unclassified") {
      return {
        status: "unclassified",
        candidateKey: "",
        reviewRounds: 0,
        source: "",
        sourceRefs: [],
        boundaries: ["traditional_taxonomy_only", "no_automatic_naming"]
      };
    }
    return {
      candidateKey: spec.key,
      status,
      reviewRounds: Math.max(1, Math.min(2, Number(source.reviewRounds || (status === "confirmed" ? 2 : 1)))),
      proposedAt: source.proposedAt || null,
      confirmedAt: source.confirmedAt || null,
      invalidatedAt: source.invalidatedAt || null,
      invalidationReason: source.invalidationReason || null,
      source: "manual_two_stage_traditional_review",
      taxonomyVersion: "traditional-palm-lines-v1",
      sourceRefs: spec.sourceRefs.slice(),
      boundaries: ["traditional_taxonomy_only", "geometry_and_name_reviewed_separately", "no_predictive_validity_claim"]
    };
  }

  function applyCreaseSemanticReview(polyline, key, action, reviewedAt = new Date().toISOString()) {
    if (!polyline || polyline.reviewStatus !== "accepted") return false;
    const current = normalizeCreaseSemanticReview(polyline);
    if (action === "clear") {
      polyline.semanticKey = null;
      polyline.semanticStatus = "unclassified";
      polyline.namingAllowed = false;
      polyline.semanticReview = null;
      return true;
    }
    const spec = palmCreaseSemanticSpec(key);
    if (!spec) return false;
    if (action === "propose") {
      polyline.semanticKey = null;
      polyline.semanticStatus = "proposed";
      polyline.namingAllowed = false;
      polyline.semanticReview = {
        candidateKey: spec.key,
        status: "proposed",
        reviewRounds: 1,
        proposedAt: reviewedAt,
        confirmedAt: null,
        source: "manual_two_stage_traditional_review",
        taxonomyVersion: "traditional-palm-lines-v1",
        sourceRefs: spec.sourceRefs.slice(),
        boundaries: ["traditional_taxonomy_only", "geometry_and_name_reviewed_separately", "no_predictive_validity_claim"]
      };
      return true;
    }
    if (action !== "confirm" || current.status !== "proposed" || current.candidateKey !== spec.key) return false;
    polyline.semanticKey = spec.key;
    polyline.semanticStatus = "manual_confirmed";
    polyline.namingAllowed = true;
    polyline.semanticReview = {
      ...current,
      status: "confirmed",
      reviewRounds: 2,
      confirmedAt: reviewedAt
    };
    return true;
  }

  function invalidateCreaseSemanticReview(polyline, reason, invalidatedAt = new Date().toISOString()) {
    if (!polyline) return false;
    const current = normalizeCreaseSemanticReview(polyline);
    if (current.status === "unclassified") {
      polyline.semanticKey = null;
      polyline.semanticStatus = "unclassified";
      polyline.namingAllowed = false;
      return false;
    }
    polyline.semanticKey = null;
    polyline.semanticStatus = "invalidated";
    polyline.namingAllowed = false;
    polyline.semanticReview = {
      ...current,
      status: "invalidated",
      invalidatedAt,
      invalidationReason: reason || "geometry_changed"
    };
    return true;
  }

  function normalizeImportedCreasePolylines(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 8).map((item, index) => {
      if (!item || !Array.isArray(item.points)) return null;
      const points = item.points.slice(0, 48).map((point) => {
        const x = Number(point && point.x);
        const y = Number(point && point.y);
        if (!isUnitCoordinate(x) || !isUnitCoordinate(y)) return null;
        return { x: roundMetric(x), y: roundMetric(y) };
      }).filter(Boolean);
      if (points.length < 3) return null;
      const manualGeometry = ["manual_polyline_fragment", "manual_reconnected_polyline"].includes(item.geometry);
      const standaloneGeometry = item.geometry === "standalone_centerline_polyline" && item.stitchStatus === "standalone";
      const stitchStatus = standaloneGeometry
        ? "standalone"
        : ["manual_split", "manual_reconnect"].includes(item.stitchStatus)
        ? item.stitchStatus
        : "provisional";
      const reviewStatus = ["accepted", "rejected"].includes(item.reviewStatus) ? item.reviewStatus : "pending";
      return {
        ...item,
        key: safePolylineKey(item.key, `crease_polyline_${index + 1}`),
        label: manualGeometry && item.label ? String(item.label).slice(0, 40) : standaloneGeometry ? "待复核掌褶单段长线" : "待复核掌褶拼接长线",
        points,
        confidence: roundMetric(clamp(Number(item.confidence || 0), 0, 0.72)),
        segmentCount: Math.max(manualGeometry || standaloneGeometry ? 1 : 2, Math.min(8, Number(item.segmentCount || (manualGeometry || standaloneGeometry ? 1 : 2)))),
        joinCount: Math.max(manualGeometry || standaloneGeometry ? 0 : 1, Math.min(7, Number(item.joinCount || (manualGeometry || standaloneGeometry ? 0 : 1)))),
        source: item.source || "model_adapter",
        geometry: manualGeometry || standaloneGeometry ? item.geometry : "stitched_centerline_polyline",
        stitchStatus,
        reviewStatus,
        semanticKey: null,
        semanticStatus: "unclassified",
        semanticReview: null,
        reviewRequired: true,
        namingAllowed: false
      };
    }).filter(Boolean);
  }

  function safePolylineKey(value, fallback) {
    const text = typeof value === "string" ? value : "";
    return /^[A-Za-z0-9:_-]{1,120}$/.test(text) ? text : fallback;
  }

  function normalizeModelAnnotations(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item || !item.key) return null;
        const status = annotationStatusLabels[item.status] ? item.status : "unknown";
        return {
          ...item,
          status,
          statusLabel: annotationStatusLabel(status),
          source: "model_adapter"
        };
      })
      .filter(Boolean);
  }

  function applyImportedModelResult(result, options = {}) {
    if (!result || !["palm", "face"].includes(result.mode)) return false;
    const sample = sampleForModelResult(result.mode, options.sampleId || result.sampleId);
    if (!sample) return false;
    const expectedRevision = Number(options.expectedRecognitionRevision);
    if (Number.isInteger(expectedRevision) && expectedRevision >= 0
      && !recognitionResultIsCurrent(sample, expectedRevision, result.recognitionRevision)) {
      state.modelRecognitionCacheStats.staleDiscards += 1;
      appendRecognitionResultAudit(sample, {
        status: "stale_discarded",
        revision: expectedRevision,
        currentRevision: sampleRecognitionRevision(sample),
        source: options.recognitionSource || "endpoint",
        modelVersion: result.modelVersion
      });
      return false;
    }
    state.importedModelResults.unshift({
      ...result,
      sampleId: options.sampleId || result.sampleId || null,
      importedAt: new Date().toISOString()
    });
    state.importedModelResults = state.importedModelResults.slice(0, 50);
    mergeModelGeometryIntoSample(result, sample);
    invalidateDerivedData();
    rebuildModelRegions(result.mode);
    if (result.mode === "palm") {
      applyModelAnnotations("palm-line-annotations", result.lineAnnotations);
      if (!options.deferRender) {
        if (result.modeMismatch || result.noTargetEvidence) updatePalmFromSamples({ autoRecognize: false });
        else renderPalmReport();
      }
    } else {
      applyModelAnnotations("face-zone-annotations", result.zoneAnnotations);
      if (!options.deferRender) {
        if (result.modeMismatch || result.noTargetEvidence) updateFaceFromSamples({ autoRecognize: false });
        else renderFaceReport();
      }
    }
    if (!options.deferRender) {
      drawImportedModelGeometry(result, sample);
      renderImportedModelDebug(result);
      renderUniversalRoutes();
    }
    if (Number.isInteger(expectedRevision) && expectedRevision >= 0) {
      appendRecognitionResultAudit(sample, {
        status: "applied",
        revision: expectedRevision,
        currentRevision: sampleRecognitionRevision(sample),
        source: options.recognitionSource || "endpoint",
        modelVersion: result.modelVersion
      });
    }
    return true;
  }

  function sampleForModelResult(mode, sampleId = "") {
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    if (sampleId) return samples.find((sample) => sample.id === sampleId) || null;
    return samples[samples.length - 1] || null;
  }

  function importedRegionKeysForSample(sample, mode) {
    const result = sample && sample.modelResult;
    if (!result || result.mode !== mode || sampleModeMismatch(sample) || sampleAnalysisBlocked(sample) || !result.importedAt || !Array.isArray(result.regions)) return [];
    const allowed = new Set((mode === "palm" ? palmCapabilitySpecs() : faceCapabilitySpecs()).map((item) => item.key));
    const visibleForSampleType = new Set(capabilityRegionKeys(mode, sample.type));
    return result.regions.filter((key) => allowed.has(key) && visibleForSampleType.has(key));
  }

  function rebuildModelRegions(mode) {
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    state.modelRegions[mode] = new Set(
      modeAnalysisSamples(samples).flatMap((sample) => importedRegionKeysForSample(sample, mode))
    );
    return state.modelRegions[mode];
  }

  function applyModelAnnotations(rootId, annotations) {
    annotations.forEach((item) => {
      setModelAnnotation(rootId, item.key, item.status);
    });
  }

  function setModelAnnotation(rootId, key, status) {
    const input = $(`#${rootId} [data-annotation="${key}"]`);
    if (!input) return;
    if (input.value === "unknown" || input.dataset.source !== "manual") {
      input.value = status;
      input.dataset.auto = "model";
      input.dataset.source = "model_adapter";
    }
  }

  function renderImportedModelDebug(result) {
    const target = $("#model-debug");
    if (!target) return;
    $("#model-status").textContent = result.modelVersion;
    target.value = JSON.stringify({
      importedModelResult: result,
      appliedAt: new Date().toISOString()
    }, null, 2);
  }

  function mergeModelGeometryIntoSample(result, sample) {
    const previousPolylines = sample.modelResult && Array.isArray(sample.modelResult.creasePolylines)
      ? sample.modelResult.creasePolylines
      : [];
    const previousFaceObservations = sample.modelResult && Array.isArray(sample.modelResult.faceObservationCandidates)
      ? sample.modelResult.faceObservationCandidates
      : [];
    const sameModelVersion = Boolean(result.modelVersion && sample.modelVersion && result.modelVersion === sample.modelVersion);
    const mergedResult = sameModelVersion
      ? result.mode === "palm" ? {
          ...result,
          creasePolylines: preserveCompatibleCreaseReviews(previousPolylines, result.creasePolylines)
        } : {
          ...result,
          faceObservationCandidates: faceObservationRuntime.preserve(previousFaceObservations, result.faceObservationCandidates)
        }
      : result;
    sample.modelResult = {
      ...sample.modelResult,
      ...mergedResult,
      importedAt: new Date().toISOString()
    };
    const previousWarnings = (Array.isArray(sample.warnings) ? sample.warnings : [])
      .filter((warning) => (
        (result.modeMismatch || !isModeMismatchWarning(warning)) &&
        (result.noTargetEvidence || !isNoTargetWarning(warning))
      ));
    sample.warnings = Array.from(new Set([
      ...previousWarnings,
      ...(Array.isArray(result.warnings) ? result.warnings : [])
    ]));
    sample.overlayRegions = result.overlayRegions || sample.overlayRegions;
    sample.modelVersion = result.modelVersion || sample.modelVersion;
    if (result.modeMismatch) {
      sample.modeMismatch = result.modeMismatch;
      sample.suggestedMode = result.modeMismatch.suggestedMode;
      sample.routeEvidence = {
        ...(sample.routeEvidence || {}),
        needsReview: true,
        modeMismatchPreviousNeedsReview: sample.routeEvidence && sample.routeEvidence.modeMismatch
          ? Boolean(sample.routeEvidence.modeMismatchPreviousNeedsReview)
          : Boolean(sample.routeEvidence && sample.routeEvidence.needsReview),
        modeMismatch: deepClone(result.modeMismatch),
        suggestedMode: result.modeMismatch.suggestedMode
      };
    } else {
      sample.modeMismatch = null;
      if (sample.routeEvidence && sample.routeEvidence.modeMismatch) {
        const routeEvidence = { ...sample.routeEvidence };
        routeEvidence.needsReview = Boolean(routeEvidence.modeMismatchPreviousNeedsReview);
        delete routeEvidence.modeMismatch;
        delete routeEvidence.suggestedMode;
        delete routeEvidence.modeMismatchPreviousNeedsReview;
        sample.routeEvidence = routeEvidence;
      }
    }
    sample.noTargetEvidence = result.noTargetEvidence && result.noTargetEvidence.trustedForAnalysisGate === true
      ? result.noTargetEvidence
      : null;
    if (result.subject && result.subject.box) {
      sample.metrics = mergeNativeSubjectMetrics(sample.metrics, result.subject);
    }
    if (result.mode === "palm" && result.handOrientation) {
      sample.handOrientation = result.handOrientation;
      sample.metrics = {
        ...sample.metrics,
        handOrientation: result.handOrientation
      };
    }
    if (result.mode === "face" && result.faceOrientation) {
      sample.faceOrientation = result.faceOrientation;
      sample.metrics = {
        ...sample.metrics,
        faceOrientation: result.faceOrientation
      };
    }
    if (result.suggestedType && result.suggestedType !== "mixed" && sample.userType === "auto") {
      sample.suggestedType = result.suggestedType;
      if (sampleTypeCatalog(result.mode).some((item) => item.value === result.suggestedType)) {
        sample.type = result.suggestedType;
        sample.label = sampleTypeLabel(result.mode, result.suggestedType);
      }
    }
    syncUniversalRouteAngle(sample, result.mode);
    if (!Array.isArray(sample.geometryCorrections)) sample.geometryCorrections = [];
    if (!Array.isArray(sample.creaseGeometryEdits)) sample.creaseGeometryEdits = [];
  }

  function syncUniversalRouteAngle(sample, mode) {
    const route = state.universalRoutes.find((item) => item.sampleId === sample.id && item.mode === mode);
    if (!route) return;
    const previousType = route.sampleType;
    route.sampleType = sample.type;
    if (previousType === sample.type) return;
    const reasons = Array.isArray(route.reasons) ? route.reasons : [];
    route.reasons = [
      ...reasons.filter((reason) => !reason.startsWith("原生朝向修正为")),
      `原生朝向修正为${sampleTypeLabel(mode, sample.type)}`
    ];
  }

  function polylineGeometryReviewDistance(first, second) {
    const left = first && Array.isArray(first.points) ? first.points : [];
    const right = second && Array.isArray(second.points) ? second.points : [];
    if (left.length < 3 || right.length < 3) return Infinity;
    const ratios = [0, 0.25, 0.5, 0.75, 1];
    const squared = ratios.map((ratio) => {
      const a = left[Math.round((left.length - 1) * ratio)];
      const b = right[Math.round((right.length - 1) * ratio)];
      return Math.pow(Number(a.x) - Number(b.x), 2) + Math.pow(Number(a.y) - Number(b.y), 2);
    });
    return Math.sqrt(squared.reduce((total, value) => total + value, 0) / squared.length);
  }

  function preserveCompatibleCreaseReviews(previousItems, nextItems) {
    const previousByKey = new Map((Array.isArray(previousItems) ? previousItems : []).map((item) => [item && item.key, item]));
    return (Array.isArray(nextItems) ? nextItems : []).map((item) => {
      const previous = previousByKey.get(item && item.key);
      if (!previous || !["accepted", "rejected"].includes(previous.reviewStatus)) return item;
      if (polylineGeometryReviewDistance(previous, item) > 0.018) return item;
      const semanticReview = normalizeCreaseSemanticReview(previous);
      const semanticConfirmed = previous.reviewStatus === "accepted" && semanticReview.status === "confirmed";
      return {
        ...item,
        reviewStatus: previous.reviewStatus,
        reviewedAt: previous.reviewedAt || null,
        reviewSource: previous.reviewSource || "manual_geometry_review",
        semanticKey: semanticConfirmed ? semanticReview.candidateKey : null,
        semanticStatus: semanticConfirmed ? "manual_confirmed" : semanticReview.status,
        semanticReview: semanticReview.status === "unclassified" ? null : semanticReview,
        namingAllowed: semanticConfirmed
      };
    });
  }

  function mergeNativeSubjectMetrics(metrics, subject) {
    const current = metrics && typeof metrics === "object" ? metrics : {};
    const currentSubject = current.subject && typeof current.subject === "object" ? current.subject : {};
    const box = subject && subject.box ? subject.box : null;
    if (!box || ![box.x, box.y, box.width, box.height].every((value) => Number.isFinite(Number(value)))) return current;
    const normalizedBox = {
      x: roundMetric(clamp(Number(box.x), 0, 1)),
      y: roundMetric(clamp(Number(box.y), 0, 1)),
      width: roundMetric(clamp(Number(box.width), 0, 1)),
      height: roundMetric(clamp(Number(box.height), 0, 1))
    };
    const centerX = roundMetric(clamp(normalizedBox.x + normalizedBox.width / 2, 0, 1));
    const centerY = roundMetric(clamp(normalizedBox.y + normalizedBox.height / 2, 0, 1));
    const areaRatio = roundMetric(clamp(normalizedBox.width * normalizedBox.height, 0, 1));
    const centeredness = roundMetric(clamp(1 - Math.hypot(centerX - 0.5, centerY - 0.5) * 1.4, 0, 1));
    return {
      ...current,
      subject: {
        ...currentSubject,
        box: normalizedBox,
        centerX,
        centerY,
        areaRatio,
        aspectRatio: roundMetric(normalizedBox.width / Math.max(0.001, normalizedBox.height)),
        centeredness,
        source: subject.source || "model_adapter"
      },
      subjectAreaRatio: areaRatio,
      subjectCenteredness: centeredness
    };
  }

  function drawImportedModelGeometry(result, sampleOverride = null) {
    if (!result || !["palm", "face"].includes(result.mode)) return;
    const sample = sampleOverride || latestSampleForMode(result.mode);
    if (!sample || (!Array.isArray(result.keypoints) && !Array.isArray(result.lineSegments) && !Array.isArray(result.creaseCandidates) && !Array.isArray(result.creaseCenterlines) && !Array.isArray(result.creasePolylines))) return;
    if (sample !== latestSampleForMode(result.mode)) return;
    redrawPreviewForSample(result.mode, sample, sample.modelResult);
    const target = result.mode === "palm" ? $("#palm-overlay-summary") : $("#face-overlay-summary");
    if (target) {
      const keypointCount = Array.isArray(result.keypoints) ? result.keypoints.length : 0;
      const segmentCount = Array.isArray(result.lineSegments) ? result.lineSegments.length : 0;
      const creaseCount = Array.isArray(result.creaseCandidates) ? result.creaseCandidates.length : 0;
      const centerlineCount = Array.isArray(result.creaseCenterlines) ? result.creaseCenterlines.length : 0;
      const polylineCount = Array.isArray(result.creasePolylines) ? result.creasePolylines.length : 0;
      renderOverlaySummary(result.mode, sample);
      target.textContent = `${target.textContent}；端点几何叠加：关键点 ${keypointCount} / 骨架线 ${segmentCount} / 边缘片段 ${creaseCount} / 中心线 ${centerlineCount} / 待复核长线 ${polylineCount}`;
    }
  }

  function modelResultsForMode(mode) {
    return state.importedModelResults.filter((result) => result.mode === mode);
  }

  function initModelEndpointControls() {
    const urlInput = $("#model-endpoint-url");
    const modeInput = $("#model-endpoint-mode");
    if (!urlInput || !modeInput) return;
    state.modelEndpointConfig = loadModelEndpointConfig();
    urlInput.value = state.modelEndpointConfig.url;
    modeInput.value = state.modelEndpointConfig.mode;
    const persistAndRefresh = () => {
      persistModelEndpointConfig();
      setModelEndpointStatus(modelEndpointIdleStatus(state.modelEndpointConfig));
    };
    urlInput.addEventListener("input", persistAndRefresh);
    modeInput.addEventListener("change", persistAndRefresh);
    $("#call-palm-model").addEventListener("click", () => {
      callModelEndpoint("palm");
    });
    $("#call-face-model").addEventListener("click", () => {
      callModelEndpoint("face");
    });
    setModelEndpointStatus(modelEndpointIdleStatus(state.modelEndpointConfig));
  }

  function loadModelEndpointConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(modelEndpointStorageKey) || "{}");
      return normalizeModelEndpointConfig(parsed);
    } catch (error) {
      return normalizeModelEndpointConfig({});
    }
  }

  function persistModelEndpointConfig() {
    const config = readModelEndpointConfig();
    try {
      localStorage.setItem(modelEndpointStorageKey, JSON.stringify(config));
    } catch (error) {
    }
    return config;
  }

  function readModelEndpointConfig() {
    const urlInput = $("#model-endpoint-url");
    const modeInput = $("#model-endpoint-mode");
    state.modelEndpointConfig = normalizeModelEndpointConfig({
      url: urlInput ? urlInput.value : state.modelEndpointConfig.url,
      mode: modeInput ? modeInput.value : state.modelEndpointConfig.mode
    });
    return state.modelEndpointConfig;
  }

  function normalizeModelEndpointConfig(config) {
    const mode = ["off", "manual", "auto"].includes(config && config.mode) ? config.mode : defaultModelEndpointMode;
    const url = typeof (config && config.url) === "string" ? config.url.trim() : "";
    return {
      url: url || defaultModelEndpointUrl,
      mode
    };
  }

  function modelEndpointIdleStatus(config) {
    if (!config.url) return "端点未配置";
    if (builtInEndpointNeedsServer(config)) return "localhost 下自动识别";
    if (config.mode === "off") return "端点已关闭";
    if (config.mode === "auto") return "上传后自动调用";
    return "手动调用就绪";
  }

  function setModelEndpointStatus(text) {
    state.modelEndpointLastStatus = text;
    const target = $("#model-endpoint-status");
    if (target) target.textContent = text;
  }

  function maybeAutoCallModelEndpoint(mode, requestedSamples = null, options = {}) {
    const config = readModelEndpointConfig();
    if (config.mode !== "auto" || !config.url) return Promise.resolve({ requested: 0, applied: 0, failed: 0 });
    if (builtInEndpointNeedsServer(config)) {
      setModelEndpointStatus("请用 localhost 自动识别");
      return Promise.resolve({ requested: 0, applied: 0, failed: 0 });
    }
    const samples = (Array.isArray(requestedSamples) ? requestedSamples : [latestSampleForMode(mode)]).filter(Boolean);
    if (!samples.length) return Promise.resolve({ requested: 0, applied: 0, failed: 0 });
    samples.forEach((sample) => {
      if (!sample.pendingRecognitionImage && sample === latestSampleForMode(mode)) {
        captureSampleRecognitionImage(sample, state.previewBaseCanvases[mode] || canvasForMode(mode), "auto_endpoint");
      }
    });
    const previous = state.modelRecognitionQueues[mode] || Promise.resolve();
    const queued = previous
      .catch(() => null)
      .then(() => recognizeModelSampleBatch(mode, samples, options));
    state.modelRecognitionQueues[mode] = queued;
    return queued;
  }

  async function recognizeModelSampleBatch(mode, samples, options = {}) {
    const uniqueSamples = Array.from(new Map(samples.map((sample) => [sample.id, sample])).values());
    const modeName = mode === "palm" ? "手相" : "面相";
    let applied = 0;
    let failed = 0;
    let staleDiscarded = 0;
    setModelEndpointStatus(`${modeName}排队识别 0/${uniqueSamples.length}`);
    for (let index = 0; index < uniqueSamples.length; index += 1) {
      const sample = uniqueSamples[index];
      const pendingImage = sample.pendingRecognitionImage || null;
      const imageDataUrl = pendingImage && pendingImage.dataUrl;
      const expectedRecognitionRevision = pendingImage && Number.isInteger(Number(pendingImage.revision))
        ? Number(pendingImage.revision)
        : sampleRecognitionRevision(sample);
      const staleBefore = recognitionAuditCount(sample, "stale_discarded");
      const ok = await callModelEndpoint(mode, {
        sampleId: sample.id,
        imageDataUrl,
        expectedRecognitionRevision,
        deferRender: true,
        deferDebug: true,
        statusText: `${modeName}排队识别 ${index + 1}/${uniqueSamples.length}`
      });
      if (ok) applied += 1;
      else if (recognitionAuditCount(sample, "stale_discarded") > staleBefore) staleDiscarded += 1;
      else failed += 1;
      if (!options.allowNativeReroute || !nativeUniversalRerouteCandidate(sample)) {
        releasePendingRecognitionImage(sample, expectedRecognitionRevision);
      }
    }
    if (!options.deferRefresh) refreshModeAfterModelBatch(mode);
    renderModelBatchDebug(mode, uniqueSamples, applied, failed, staleDiscarded);
    const noTargetCount = uniqueSamples.filter(sampleNoTarget).length;
    const status = $("#model-import-status");
    if (status) status.textContent = `批量端点已应用 ${applied}/${uniqueSamples.length}${noTargetCount ? `，无目标 ${noTargetCount}` : ""}${staleDiscarded ? `，过期丢弃 ${staleDiscarded}` : ""}${failed ? `，失败 ${failed}` : ""}`;
    const uploadStatus = $(mode === "palm" ? "#palm-status" : "#face-status");
    if (uploadStatus && noTargetCount) {
      uploadStatus.textContent = noTargetCount === uniqueSamples.length
        ? "未识别到手或脸，请换清晰目标照片"
        : `已处理 ${uniqueSamples.length} 张，其中 ${noTargetCount} 张无可分析目标`;
    }
    setModelEndpointStatus(`${modeName}批量识别完成 ${applied}/${uniqueSamples.length}${noTargetCount ? `，无目标 ${noTargetCount}` : ""}${staleDiscarded ? `，过期 ${staleDiscarded}` : ""}`);
    return { requested: uniqueSamples.length, applied, failed, staleDiscarded, noTargetCount };
  }

  function refreshModeAfterModelBatch(mode) {
    if (mode === "palm") updatePalmFromSamples({ autoRecognize: false });
    else updateFaceFromSamples({ autoRecognize: false });
    redrawLatestPreview(mode);
    renderUniversalRoutes();
  }

  function renderModelBatchDebug(mode, samples, applied, failed, staleDiscarded = 0) {
    const target = $("#model-debug");
    if (!target) return;
    $("#model-status").textContent = "bounded-recognition-queue-v1";
    target.value = JSON.stringify({
      batchRecognition: {
        mode,
        requested: samples.length,
        applied,
        failed,
        staleDiscarded,
        concurrency: 1,
        sessionCache: modelRecognitionCacheSnapshot(),
        sampleIds: samples.map((sample) => sample.id),
        completedAt: new Date().toISOString()
      }
    }, null, 2);
  }

  async function recognitionCacheKey(config, mode, sample, imageDataUrl) {
    if (!config || config.url !== defaultModelEndpointUrl || !sample || !imageDataUrl) return "";
    if (!globalThis.crypto || !globalThis.crypto.subtle) return "";
    try {
      const response = await fetch(imageDataUrl);
      const bytes = await response.arrayBuffer();
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
      return `${mode}:${sample.type || sample.suggestedType || "mixed"}:${hash}`;
    } catch (error) {
      return "";
    }
  }

  function getRecognitionCacheEntry(key) {
    if (!key || !state.modelRecognitionCache.has(key)) return null;
    const entry = state.modelRecognitionCache.get(key);
    state.modelRecognitionCache.delete(key);
    state.modelRecognitionCache.set(key, entry);
    return entry;
  }

  function setRecognitionCacheEntry(key, response, mode, sample) {
    if (!key || !response) return;
    state.modelRecognitionCache.delete(key);
    state.modelRecognitionCache.set(key, {
      response: deepClone(response),
      mode,
      sampleType: sample ? sample.type : "mixed",
      cachedAt: new Date().toISOString()
    });
    while (state.modelRecognitionCache.size > modelRecognitionCacheLimit) {
      const oldestKey = state.modelRecognitionCache.keys().next().value;
      state.modelRecognitionCache.delete(oldestKey);
    }
    renderRuntimePerformanceStatus();
  }

  function modelRecognitionCacheSnapshot() {
    return {
      scope: "builtin_endpoint_session_only",
      entries: state.modelRecognitionCache.size,
      limit: modelRecognitionCacheLimit,
      hits: state.modelRecognitionCacheStats.hits,
      misses: state.modelRecognitionCacheStats.misses,
      staleDiscards: state.modelRecognitionCacheStats.staleDiscards,
      storesImageData: false
    };
  }

  async function callModelEndpoint(mode, options = {}) {
    const config = readModelEndpointConfig();
    const modeName = mode === "palm" ? "手相" : "面相";
    if (!config.url) {
      setModelEndpointStatus("端点未配置");
      return false;
    }
    if (config.mode === "off") {
      setModelEndpointStatus("端点已关闭");
      return false;
    }
    if (builtInEndpointNeedsServer(config)) {
      setModelEndpointStatus("请用 localhost 自动识别");
      return false;
    }
    if (state.modelEndpointBusy[mode]) {
      setModelEndpointStatus(`${modeName}模型调用中`);
      return false;
    }
    const endpointUrl = normalizedEndpointUrl(config.url);
    if (!endpointUrl) {
      setModelEndpointStatus("端点 URL 无效");
      return false;
    }
    const targetSample = sampleForModelResult(mode, options.sampleId);
    const expectedRecognitionRevision = Number.isInteger(Number(options.expectedRecognitionRevision))
      ? Number(options.expectedRecognitionRevision)
      : sampleRecognitionRevision(targetSample);
    const payload = buildEndpointPayload(mode, {
      targetSample,
      imageDataUrl: options.imageDataUrl,
      recognitionRevision: expectedRecognitionRevision
    });
    if (!payload.samples.length) {
      setModelEndpointStatus(`请先上传${modeName}图`);
      return false;
    }
    state.modelEndpointBusy[mode] = true;
    setModelEndpointStatus(options.statusText || `${modeName}模型调用中`);
    try {
      const cacheKey = await recognitionCacheKey(config, mode, targetSample, payload.imageDataUrl);
      const cached = getRecognitionCacheEntry(cacheKey);
      if (cached) {
        state.modelRecognitionCacheStats.hits += 1;
        const results = normalizeImportedModelPayload(cached.response);
        let applied = 0;
        for (const result of results) {
          const rebound = {
            ...result,
            sampleId: targetSample ? targetSample.id : null,
            recognitionRevision: expectedRecognitionRevision,
            recognitionCache: {
              hit: true,
              scope: "builtin_endpoint_session_only",
              cachedAt: cached.cachedAt
            }
          };
          if (applyImportedModelResult(rebound, {
            sampleId: targetSample ? targetSample.id : "",
            expectedRecognitionRevision,
            recognitionSource: "session_cache",
            deferRender: Boolean(options.deferRender)
          })) applied += 1;
        }
        if (targetSample && applied) targetSample.recognitionCache = { hit: true, reusedAt: new Date().toISOString(), scope: "builtin_endpoint_session_only" };
        if (!options.deferDebug) renderModelEndpointDebug(payload, { cacheHit: true, cachedAt: cached.cachedAt }, null);
        if (!options.statusText) setModelEndpointStatus(applied ? `${modeName}已复用同图识别` : "缓存结果过期或不可应用");
        return Boolean(applied);
      }
      if (cacheKey) state.modelRecognitionCacheStats.misses += 1;
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = await response.json();
      const results = normalizeImportedModelPayload(parsed);
      let applied = 0;
      for (const result of results) {
        const withCacheEvidence = cacheKey
          ? {
              ...result,
              recognitionCache: {
                hit: false,
                scope: "builtin_endpoint_session_only",
                cachedAt: null
              }
            }
          : result;
        if (applyImportedModelResult(withCacheEvidence, {
          sampleId: targetSample ? targetSample.id : "",
          expectedRecognitionRevision,
          recognitionSource: "endpoint_response",
          deferRender: Boolean(options.deferRender)
        })) applied += 1;
      }
      if (cacheKey && applied) setRecognitionCacheEntry(cacheKey, parsed, mode, targetSample);
      if (targetSample && cacheKey && applied) targetSample.recognitionCache = { hit: false, storedAt: new Date().toISOString(), scope: "builtin_endpoint_session_only" };
      if (!options.deferDebug) renderModelEndpointDebug(payload, parsed, null);
      const status = $("#model-import-status");
      if (status && !options.deferRender) status.textContent = applied ? `端点已应用 ${applied} 条` : "端点无可应用结果";
      if (!options.statusText) setModelEndpointStatus(applied ? `${modeName}模型已应用` : "端点无可应用结果");
      return Boolean(applied);
    } catch (error) {
      if (!options.deferDebug) renderModelEndpointDebug(payload, null, error);
      setModelEndpointStatus(`调用失败：${shortError(error)}`);
      return false;
    } finally {
      state.modelEndpointBusy[mode] = false;
    }
  }

  function buildEndpointPayload(mode, options = {}) {
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    const targetSample = options.targetSample || samples[samples.length - 1] || null;
    const metrics = targetSample && targetSample.metrics
      ? targetSample.metrics
      : (mode === "palm" ? state.palmMetrics : state.faceMetrics);
    const annotationList = mode === "palm" ? collectPalmLineAnnotations() : collectFaceZoneAnnotations();
    const annotations = mode === "palm"
      ? { lineAnnotations: annotationList }
      : { zoneAnnotations: annotationList };
    const coverage = recognitionCoverage(mode, samples);
    const matrix = recognitionMatrix(mode, samples);
    const checklist = shotChecklist(mode, coverage, matrix, annotationList);
    const readiness = recognitionReadiness(mode, coverage, matrix, checklist, samples);
    const fallbackPlan = recognitionFallbackPlan(mode, coverage, matrix, checklist, readiness, samples);
    return {
      contractVersion: recognitionAdapter.contractVersion,
      adapterRequestVersion: 1,
      source: "palm-face-bazi-site",
      createdAt: new Date().toISOString(),
      mode,
      sampleId: targetSample ? targetSample.id : null,
      recognitionRevision: Number.isInteger(Number(options.recognitionRevision))
        ? Number(options.recognitionRevision)
        : sampleRecognitionRevision(targetSample),
      requestedOutputs: mode === "palm"
        ? ["regions", "lineAnnotations", "overlayRegions", "keypoints", "lineSegments", "creaseCandidates", "creaseCenterlines", "creasePolylines", "creaseDetection", "prioritySignals", "handOrientation", "subjectCandidates"]
        : ["regions", "zoneAnnotations", "overlayRegions", "keypoints", "lineSegments", "prioritySignals", "faceOrientation", "faceProportions", "subjectCandidates"],
      imageDataUrl: options.imageDataUrl || canvasDataUrlForMode(mode, targetSample),
      samples: targetSample ? [sampleForEndpoint(targetSample)] : [],
      latestSample: sampleForEndpoint(targetSample),
      imageTransformContext: imageTransformContext(mode, targetSample),
      metrics,
      handContext: mode === "palm" ? {
        dominantHand: $("#dominant-hand").value,
        selectedSide: $("#palm-side").value,
        inferred: metrics && metrics.handOrientation ? metrics.handOrientation : null
      } : null,
      faceContext: mode === "face" ? {
        selectedType: $("#face-photo-type").value,
        inferred: metrics && metrics.faceOrientation ? metrics.faceOrientation : null
      } : null,
      faceProportionContext: mode === "face" ? faceProportionProfile(samples) : null,
      coverage,
      matrix,
      recognitionReadiness: readiness,
      recognitionFallback: fallbackPlan,
      shotChecklist: checklist,
      shotGuide: shotGuideSnapshot(mode, checklist),
      geometryTrainingProfile: geometryTrainingProfile(mode),
      manualRegions: Array.from(state.manualRegions[mode]),
      modelRegions: Array.from(state.modelRegions[mode]),
      annotations,
      features: mode === "palm" ? checkedValues("palm-features") : checkedValues("face-features"),
      boundaries: ["traditional_reference_only", "no_medical_diagnosis", "no_death_year_prediction"]
    };
  }

  function sampleForEndpoint(sample) {
    if (!sample) return null;
    const exported = sampleForExport(sample);
    return {
      id: sample.id,
      ...exported,
      thumbnail: null,
      modelInput: sample.modelInput
    };
  }

  function imageTransformContext(mode, sampleOverride = null) {
    const sample = sampleOverride || latestSampleForMode(mode);
    if (!sample) {
      return {
        rotation: 0,
        rotationCorrections: [],
        preprocessCorrections: []
      };
    }
    return {
      rotation: normalizeTotalRotation(sample.rotation || 0),
      rotationCorrections: sample.rotationCorrections || [],
      preprocessCorrections: sample.preprocessCorrections || []
    };
  }

  function canvasDataUrlForMode(mode, sampleOverride = null) {
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    if (!samples.length) return null;
    const sample = sampleOverride || samples[samples.length - 1];
    if (sample && sample.pendingRecognitionImage && sample.pendingRecognitionImage.dataUrl) {
      return sample.pendingRecognitionImage.dataUrl;
    }
    if (sample !== samples[samples.length - 1]) return null;
    const canvas = $(mode === "palm" ? "#palm-canvas" : "#face-canvas");
    if (!canvas) return null;
    try {
      return canvas.toDataURL("image/jpeg", 0.86);
    } catch (error) {
      return null;
    }
  }

  function renderModelEndpointDebug(payload, response, error) {
    const target = $("#model-debug");
    if (!target) return;
    target.value = JSON.stringify({
      endpointRequest: redactEndpointPayloadForDebug(payload),
      endpointResponse: response,
      error: error ? shortError(error) : null,
      handledAt: new Date().toISOString()
    }, null, 2);
  }

  function redactEndpointPayloadForDebug(payload) {
    if (!payload) return null;
    return {
      ...payload,
      imageDataUrl: payload.imageDataUrl ? `[imageDataUrl:${payload.imageDataUrl.length}]` : null
    };
  }

  function modelEndpointSnapshot() {
    const config = readModelEndpointConfig();
    return {
      mode: config.mode,
      configured: Boolean(config.url),
      urlHost: safeUrlHost(config.url),
      lastStatus: state.modelEndpointLastStatus,
      sessionCache: modelRecognitionCacheSnapshot(),
      runtimePerformance: runtimePerformanceSnapshot()
    };
  }

  function normalizedEndpointUrl(url) {
    try {
      return new URL(url, window.location.href).toString();
    } catch (error) {
      return "";
    }
  }

  function builtInEndpointNeedsServer(config) {
    return config && config.url === defaultModelEndpointUrl && window.location.protocol === "file:";
  }

  function safeUrlHost(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.host || "same-origin";
    } catch (error) {
      return "";
    }
  }

  function shortError(error) {
    return String(error && error.message ? error.message : error || "unknown").slice(0, 120);
  }

  function roundMetric(value) {
    return Math.round((Number(value) || 0) * 1000) / 1000;
  }

  function updatePalmFromSamples(options = {}) {
    const analysisSamples = modeAnalysisSamples(state.palmSamples);
    state.palmMetrics = aggregateMetrics(analysisSamples);
    if (state.palmMetrics) {
      applyPalmDetection(analysisSamples);
      prefillPalmLineAnnotations(analysisSamples);
    } else {
      clearAutoDetectedFeatures("palm-features");
      resetAutoAnnotations("palm-line-annotations");
    }
    renderPalmMetrics();
    renderSampleList("palm");
    renderPalmReport();
    if (options.autoRecognize !== false) maybeAutoCallModelEndpoint("palm");
  }

  function updateFaceFromSamples(options = {}) {
    const analysisSamples = modeAnalysisSamples(state.faceSamples);
    state.faceMetrics = aggregateMetrics(analysisSamples);
    if (state.faceMetrics) {
      applyFaceDetection(analysisSamples);
      prefillFaceZoneAnnotations();
    } else {
      clearAutoDetectedFeatures("face-features");
      resetAutoAnnotations("face-zone-annotations");
    }
    renderFaceMetrics();
    renderSampleList("face");
    renderFaceReport();
    if (options.autoRecognize !== false) maybeAutoCallModelEndpoint("face");
  }

  function aggregateMetrics(samples) {
    if (!samples.length) return null;
    const keys = [
      "brightness",
      "contrast",
      "warmth",
      "redness",
      "edgeDensity",
      "lineClarity",
      "textureBusy",
      "symmetry",
      "quality",
      "skinCoverage",
      "subjectAreaRatio",
      "subjectCenteredness",
      "verticalRatio",
      "horizontalRatio",
      "diagonalRatio"
    ];
    const aggregated = Object.fromEntries(keys.map((key) => [key, average(samples.map((sample) => sample.metrics[key] || 0))]));
    aggregated.handOrientation = aggregateHandOrientation(samples);
    aggregated.faceOrientation = aggregateFaceOrientation(samples);
    return aggregated;
  }

  function sampleModeMismatch(sample) {
    return Boolean(sample && (
      (sample.modeMismatch && sample.modeMismatch.detected === true) ||
      (sample.modelResult && sample.modelResult.modeMismatch && sample.modelResult.modeMismatch.detected === true)
    ));
  }

  function noTargetEvidenceForSample(sample) {
    const evidence = sample && (
      sample.noTargetEvidence ||
      (sample.modelResult && sample.modelResult.noTargetEvidence)
    );
    return evidence && evidence.confirmed === true && evidence.trustedForAnalysisGate === true ? evidence : null;
  }

  function sampleNoTarget(sample) {
    return Boolean(noTargetEvidenceForSample(sample));
  }

  function handPoseSuitabilityForSample(sample) {
    return sample && (
      sample.handPoseSuitability ||
      (sample.modelResult && sample.modelResult.handPoseSuitability)
    ) || null;
  }

  function palmSurfaceVerificationForSample(sample) {
    return sample && sample.modelResult && sample.modelResult.palmSurfaceVerification || null;
  }

  function unresolvedSubjectCandidates(sample) {
    const result = sample && sample.modelResult;
    const trusted = result && ["apple-vision-native", "apple-vision-native-detail"].includes(result.adapter);
    const candidates = trusted && Array.isArray(result.subjectCandidates) ? result.subjectCandidates : [];
    const selectionStatus = String(sample && sample.subjectSelection && sample.subjectSelection.status || "");
    const manuallyResolved = selectionStatus === "manual_selected_and_cropped" || selectionStatus === "manual_selected_crop_not_needed";
    return !manuallyResolved && candidates.length > 1 ? candidates.length : 0;
  }

  function sampleAnalysisBlockReason(sample) {
    const noTarget = noTargetEvidenceForSample(sample);
    if (noTarget) {
      return {
        key: "no_target",
        label: noTarget.status === "target_unresolved" ? "目标识别未确认" : "未识别到手或脸",
        detail: noTarget.status === "target_unresolved"
          ? "指定类别的原生检测没有找到目标，另一类别反查未完成。本图不使用模板兜底，只保留审计并要求换图重试。"
          : "原生手部与面部检测都没有找到可分析目标。本图只保留审计，不进入报告、案例对照或训练真值。"
      };
    }
    const subjectCount = unresolvedSubjectCandidates(sample);
    if (subjectCount) {
      return {
        key: "subject",
        label: "主体未确认",
        detail: `画面里有 ${subjectCount} 个主体。请先选择并裁切目标。`
      };
    }
    const suitability = handPoseSuitabilityForSample(sample);
    if (
      sample.type === "palm_front" &&
      suitability &&
      suitability.trustedForAnalysisGate === true &&
      suitability.eligible !== true
    ) {
      return {
        key: "hand_pose",
        label: "手掌未摊平",
        detail: `只看到 ${suitability.extendedFingerCount}/4 根长指伸展，暂不判断掌纹。`
      };
    }
    const surface = palmSurfaceVerificationForSample(sample);
    if (surface && surface.trustedForAnalysisGate === true && surface.reviewRequired === true) {
      return {
        key: "palm_surface",
        label: "掌心/手背待确认",
        detail: `暂列为${sampleTypeLabel("palm", surface.candidateType)}候选。确认角度后再分析。`
      };
    }
    return null;
  }

  function sampleAnalysisBlocked(sample) {
    return Boolean(sampleAnalysisBlockReason(sample));
  }

  function isModeMismatchWarning(warning) {
    const text = String(warning || "");
    return text.startsWith("检测到手部，当前不应按面相分析") ||
      text.startsWith("检测到面部，当前不应按手相分析") ||
      /^请改用(手相|面相)入口或通用入口重新分流/.test(text);
  }

  function isNoTargetWarning(warning) {
    const text = String(warning || "");
    return text.startsWith("原生手部与面部检测均未找到可分析目标") ||
      text.startsWith("请换成手部或面部占画面主体的清晰照片后重试");
  }

  function modeAnalysisSamples(samples) {
    return (Array.isArray(samples) ? samples : []).filter((sample) => (
      !sampleModeMismatch(sample) && !sampleAnalysisBlocked(sample)
    ));
  }

  function clearAutoDetectedFeatures(rootId) {
    $all(`#${rootId} input[data-source="auto_heuristic"]`).forEach((input) => {
      input.checked = false;
      delete input.dataset.source;
    });
  }

  function estimateHandOrientation(metrics, evidence) {
    const empty = {
      side: "unknown",
      label: "左右未定",
      confidence: 0,
      source: "heuristic_hand_orientation",
      evidence: {
        lowerBalance: 0,
        fullBalance: 0,
        subjectCenterX: metrics.subject ? roundMetric(metrics.subject.centerX) : null
      }
    };
    if (!metrics.subject) return empty;
    const left = Number(evidence.skinLeftPixels || 0);
    const right = Number(evidence.skinRightPixels || 0);
    const lowerLeft = Number(evidence.skinLowerLeftPixels || 0);
    const lowerRight = Number(evidence.skinLowerRightPixels || 0);
    const lowerTotal = lowerLeft + lowerRight;
    const fullTotal = left + right;
    if (lowerTotal < 8 || fullTotal < 12) return empty;
    const lowerBalance = clamp((lowerLeft - lowerRight) / lowerTotal, -1, 1);
    const fullBalance = clamp((left - right) / fullTotal, -1, 1);
    const centerBias = clamp((0.5 - Number(metrics.subject.centerX || 0.5)) * 2, -1, 1);
    const score = lowerBalance * 0.68 + fullBalance * 0.18 + centerBias * 0.14;
    const typePenalty = ["palm_side", "nails", "thumb", "palm_back"].includes(metrics.suggestedType) ? 0.74 : 1;
    const confidence = Math.abs(score) < 0.08
      ? 0
      : roundMetric(clamp((Math.abs(score) * 0.72 + Math.abs(lowerBalance) * 0.2 + Number(metrics.subject.centeredness || 0) * 0.08) * typePenalty, 0, 0.92));
    const side = confidence < 0.18 ? "unknown" : score > 0 ? "right" : "left";
    return {
      side,
      label: handOrientationLabel(side),
      confidence,
      source: "heuristic_hand_orientation",
      evidence: {
        lowerBalance: roundMetric(lowerBalance),
        fullBalance: roundMetric(fullBalance),
        centerBias: roundMetric(centerBias),
        subjectCenterX: roundMetric(metrics.subject.centerX),
        skinLowerLeft: lowerLeft,
        skinLowerRight: lowerRight,
        suggestedType: metrics.suggestedType
      }
    };
  }

  function aggregateHandOrientation(samples) {
    const votes = { right: 0, left: 0, unknown: 0 };
    (Array.isArray(samples) ? samples : []).forEach((sample) => {
      const item = sample.handOrientation || (sample.metrics ? sample.metrics.handOrientation : null);
      const side = item && ["right", "left"].includes(item.side) ? item.side : "unknown";
      const weight = clamp(Number(item && item.confidence ? item.confidence : 0.08) * Number(sample.quality || 0.5), 0.02, 1);
      votes[side] += weight;
    });
    const knownTotal = votes.right + votes.left;
    if (knownTotal <= 0.02) {
      return { side: "unknown", label: "左右未定", confidence: 0, source: "aggregate_hand_orientation", votes };
    }
    const side = votes.right >= votes.left ? "right" : "left";
    const confidence = roundMetric(clamp(Math.abs(votes.right - votes.left) / knownTotal, 0, 0.96));
    return {
      side: confidence < 0.18 ? "unknown" : side,
      label: handOrientationLabel(confidence < 0.18 ? "unknown" : side),
      confidence,
      source: "aggregate_hand_orientation",
      votes: {
        right: roundMetric(votes.right),
        left: roundMetric(votes.left),
        unknown: roundMetric(votes.unknown)
      }
    };
  }

  function handOrientationLabel(side) {
    if (side === "right") return "右手候选";
    if (side === "left") return "左手候选";
    return "左右未定";
  }

  function normalizeHandOrientation(value) {
    if (!value || typeof value !== "object") return null;
    const side = ["right", "left", "unknown"].includes(value.side) ? value.side : "unknown";
    return {
      ...value,
      side,
      label: value.label || handOrientationLabel(side),
      confidence: roundMetric(clamp(Number(value.confidence || 0), 0, 1)),
      source: value.source || "model_adapter"
    };
  }

  function normalizeHandPoseSuitability(value, mode, adapter) {
    if (mode !== "palm" || !value || typeof value !== "object") return null;
    const nativeSource = adapter === "apple-vision-native" && value.source === "apple_vision_hand_pose_suitability";
    return {
      eligible: value.eligible === true,
      extendedFingerCount: Math.max(0, Math.min(4, Number(value.extendedFingerCount || 0))),
      source: nativeSource ? "apple_vision_hand_pose_suitability" : "external_hand_pose_suitability",
      sourceRefs: nativeSource ? ["web.apple-hand#output", "web.google-hand#output"] : [],
      trustedForAnalysisGate: nativeSource
    };
  }

  function normalizePalmSurfaceVerification(value, mode, adapter) {
    if (mode !== "palm" || !value || typeof value !== "object") return null;
    const source = String(value.source || "");
    const trustedAdapter = ["apple-vision-native", "builtin-local-endpoint"].includes(adapter);
    const trustedSource = ["local_palm_surface_guard", "manual_surface_confirmation"].includes(source);
    const surface = ["palm_front", "palm_back"].includes(value.surface) ? value.surface : "unknown";
    const candidateType = ["palm_front", "palm_back"].includes(value.candidateType) ? value.candidateType : "palm_front";
    return {
      surface,
      candidateType,
      confidence: roundMetric(clamp(Number(value.confidence || 0), 0, 1)),
      reviewRequired: value.reviewRequired === true,
      source: trustedSource ? source : "external_palm_surface",
      trustedForAnalysisGate: trustedAdapter && trustedSource
    };
  }

  function handOrientationTag(item) {
    if (!item || !item.side || item.side === "unknown") return "左右未定";
    return `${handOrientationLabel(item.side)} ${percent(item.confidence || 0)}`;
  }

  function currentPalmSide() {
    const input = $("#palm-side");
    return input ? input.value : "unknown";
  }

  function palmSideMismatchWarning(orientation, selectedSide) {
    if (!orientation || !["right", "left"].includes(orientation.side)) return "";
    if (!["right", "left"].includes(selectedSide)) return "";
    if (orientation.confidence < 0.42 || orientation.side === selectedSide) return "";
    return "左右手需复核";
  }

  function handOrientationReportText(orientation, selectedSide) {
    if (!orientation || orientation.side === "unknown") return " 系统暂未形成稳定左右手候选。";
    const mismatch = palmSideMismatchWarning(orientation, selectedSide);
    const base = ` 系统左右候选为${handOrientationLabel(orientation.side)}，置信 ${percent(orientation.confidence)}。`;
    return mismatch ? `${base} 与当前手动选择不完全一致，建议复核。` : base;
  }

  function estimateFaceOrientation(metrics, evidence) {
    const empty = {
      pose: "unknown",
      label: "面部朝向未定",
      confidence: 0,
      source: "heuristic_face_orientation",
      evidence: {
        symmetry: roundMetric(metrics.symmetry || 0),
        subjectCenterX: metrics.subject ? roundMetric(metrics.subject.centerX) : null
      }
    };
    if (!metrics.subject || metrics.skinCoverage < 0.05) return empty;
    const leftSkin = Number(evidence.skinLeftPixels || 0);
    const rightSkin = Number(evidence.skinRightPixels || 0);
    const skinTotal = leftSkin + rightSkin;
    const leftEdge = Number(evidence.leftEdgeEnergy || 0);
    const rightEdge = Number(evidence.rightEdgeEnergy || 0);
    const edgeTotal = leftEdge + rightEdge;
    if (skinTotal < 12 && edgeTotal <= 0) return empty;
    const skinBias = skinTotal ? clamp((rightSkin - leftSkin) / skinTotal, -1, 1) : 0;
    const edgeBias = edgeTotal ? clamp((rightEdge - leftEdge) / edgeTotal, -1, 1) : 0;
    const centerBias = clamp((Number(metrics.subject.centerX || 0.5) - 0.5) * 2, -1, 1);
    const sideBias = clamp(skinBias * 0.44 + edgeBias * 0.36 + centerBias * 0.2, -1, 1);
    const symmetry = clamp(Number(metrics.symmetry || 0), 0, 1);
    const aspect = Number(metrics.subject.aspectRatio || 1);
    const profileFit = clamp((0.78 - aspect) * 1.9, 0, 1);
    const frontFit = clamp(symmetry * 0.74 + Number(metrics.subject.centeredness || 0) * 0.26, 0, 1);
    let pose = "unknown";
    if (frontFit >= 0.66 && Math.abs(sideBias) < 0.18) {
      pose = "front";
    } else {
      const side = sideBias >= 0 ? "right" : "left";
      const profileLike = metrics.suggestedType === "face_side" || profileFit > 0.38;
      const quarterLike = metrics.suggestedType === "face_three_quarter" || Math.abs(sideBias) > 0.14 || symmetry < 0.64;
      if (profileLike) pose = `${side}_profile`;
      else if (quarterLike) pose = `${side}_three_quarter`;
    }
    const confidence = pose === "unknown"
      ? 0
      : pose === "front"
        ? roundMetric(clamp(frontFit, 0.18, 0.94))
        : roundMetric(clamp(Math.abs(sideBias) * 0.54 + (1 - symmetry) * 0.24 + profileFit * 0.22, 0.18, 0.92));
    return {
      pose: confidence < 0.18 ? "unknown" : pose,
      label: faceOrientationLabel(confidence < 0.18 ? "unknown" : pose),
      confidence,
      source: "heuristic_face_orientation",
      evidence: {
        skinBias: roundMetric(skinBias),
        edgeBias: roundMetric(edgeBias),
        centerBias: roundMetric(centerBias),
        sideBias: roundMetric(sideBias),
        symmetry: roundMetric(symmetry),
        profileFit: roundMetric(profileFit),
        frontFit: roundMetric(frontFit),
        subjectCenterX: roundMetric(metrics.subject.centerX),
        suggestedType: metrics.suggestedType
      }
    };
  }

  function aggregateFaceOrientation(samples) {
    const votes = {};
    (Array.isArray(samples) ? samples : []).forEach((sample) => {
      const item = sample.faceOrientation || (sample.metrics ? sample.metrics.faceOrientation : null);
      const pose = item && item.pose ? item.pose : "unknown";
      const weight = clamp(Number(item && item.confidence ? item.confidence : 0.08) * Number(sample.quality || 0.5), 0.02, 1);
      votes[pose] = (votes[pose] || 0) + weight;
    });
    const entries = Object.entries(votes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const [pose = "unknown", value = 0] = entries[0] || [];
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    const confidence = total ? roundMetric(clamp(value / total, 0, 0.96)) : 0;
    const resolvedPose = confidence < 0.18 ? "unknown" : pose;
    return {
      pose: resolvedPose,
      label: faceOrientationLabel(resolvedPose),
      confidence,
      source: "aggregate_face_orientation",
      votes: Object.fromEntries(entries.map(([key, count]) => [key, roundMetric(count)]))
    };
  }

  function faceOrientationLabel(pose) {
    const labels = {
      front: "正脸候选",
      left_three_quarter: "左侧三分之二候选",
      right_three_quarter: "右侧三分之二候选",
      left_profile: "左侧脸候选",
      right_profile: "右侧脸候选",
      unknown: "面部朝向未定"
    };
    return labels[pose] || labels.unknown;
  }

  function normalizeFaceOrientation(value) {
    if (!value || typeof value !== "object") return null;
    const allowed = new Set(["front", "left_three_quarter", "right_three_quarter", "left_profile", "right_profile", "unknown"]);
    const pose = allowed.has(value.pose) ? value.pose : "unknown";
    return {
      ...value,
      pose,
      label: value.label || faceOrientationLabel(pose),
      confidence: roundMetric(clamp(Number(value.confidence || 0), 0, 1)),
      source: value.source || "model_adapter"
    };
  }

  function modelSuggestedType(mode, suggestedType, faceOrientation) {
    if (mode !== "face" || isDetailShotType(suggestedType)) return suggestedType;
    if (!faceOrientation || faceOrientation.confidence < 0.62) return suggestedType;
    if (faceOrientation.pose === "front") return "face_front";
    if (faceOrientation.pose.endsWith("_three_quarter")) return "face_three_quarter";
    if (faceOrientation.pose.endsWith("_profile")) return "face_side";
    return suggestedType;
  }

  function faceOrientationTag(item) {
    if (!item || !item.pose || item.pose === "unknown") return "面部朝向未定";
    return `${faceOrientationLabel(item.pose)} ${percent(item.confidence || 0)}`;
  }

  function faceOrientationMismatchWarning(orientation, selectedType) {
    if (!orientation || !orientation.pose || orientation.pose === "unknown" || orientation.confidence < 0.5) return "";
    if (selectedType === "face_front" && orientation.pose !== "front") return "面部朝向需复核";
    if (selectedType === "face_side" && !orientation.pose.endsWith("_profile")) return "面部朝向需复核";
    if (selectedType === "face_three_quarter" && !orientation.pose.endsWith("_three_quarter")) return "面部朝向需复核";
    return "";
  }

  function faceOrientationReportText(orientation) {
    if (!orientation || orientation.pose === "unknown") return "系统暂未形成稳定面部朝向候选。";
    return `系统面部朝向候选为${faceOrientationLabel(orientation.pose)}，置信 ${percent(orientation.confidence)}。`;
  }

  function sampleTypeLabel(mode, type) {
    const palm = {
      auto: "自动判断",
      palm_front: "掌心正面",
      palm_back: "手背",
      palm_side: "小指侧边",
      palm_main_detail: "三大主线近照",
      palm_sun_wealth_detail: "太阳线/财运纹近照",
      palm_helper_detail: "贵人线近照",
      nails: "指甲近照",
      thumb: "拇指/虎口",
      mixed: "其他手部图"
    };
    const face = {
      auto: "自动判断",
      face_front: "正脸",
      face_side: "侧脸",
      face_three_quarter: "三分之二侧脸",
      forehead: "额头/上庭",
      eyes: "眉眼局部",
      nose: "鼻部局部",
      mouth_jaw: "口下巴局部",
      mixed: "其他面部图"
    };
    return (mode === "palm" ? palm : face)[type] || "未分类";
  }

  function normalizeSampleProvenance(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    const sourceType = sampleProvenanceCatalog.some((item) => item.value === source.sourceType)
      ? source.sourceType
      : "unconfirmed";
    const subjectKey = String(source.subjectKey || "")
      .trim()
      .replace(/[^A-Za-z0-9._:-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    const rightsNote = String(source.rightsNote || "").trim().slice(0, 120);
    const personalProfile = Boolean(source.personalProfile);
    const rightsConfirmed = sourceType === "self_owned"
      || (["consented", "public_licensed"].includes(sourceType) && rightsNote.length >= 3);
    return {
      subjectKey,
      sourceType,
      rightsNote,
      personalProfile,
      rightsConfirmed,
      independenceEligible: Boolean(subjectKey && rightsConfirmed && !personalProfile),
      updatedAt: source.updatedAt || null
    };
  }

  function sampleProvenanceOptions(selected) {
    return sampleProvenanceCatalog
      .map((item) => `<option value="${item.value}"${item.value === selected ? " selected" : ""}>${item.label}</option>`)
      .join("");
  }

  function sampleProvenanceStatus(provenance) {
    if (provenance.personalProfile) return "本人主档，不计独立人物";
    if (!provenance.subjectKey) return "人物编号待补";
    if (!provenance.rightsConfirmed) return "授权或许可说明待补";
    return "可计入独立人物覆盖";
  }

  function updateSampleProvenance(mode, sampleId, field, value) {
    if (!["palm", "face"].includes(mode) || !["subjectKey", "sourceType", "rightsNote"].includes(field)) return false;
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    const sample = samples.find((item) => item && item.id === sampleId);
    if (!sample || sample.personalProfile) return false;
    sample.sampleProvenance = normalizeSampleProvenance({
      ...(sample.sampleProvenance || {}),
      [field]: value,
      updatedAt: new Date().toISOString()
    });
    invalidateDerivedData();
    renderSampleList(mode);
    renderGeometryTrainingPanel();
    if (mode === "palm") renderPalmReport();
    else renderFaceReport();
    return true;
  }

  function renderSampleList(mode) {
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    const target = mode === "palm" ? $("#palm-samples") : $("#face-samples");
    if (!samples.length) {
      target.textContent = mode === "palm" ? "还没有手相样本" : "还没有面相样本";
      return;
    }
    setHtml(target, samples.map((sample) => {
      const provenance = normalizeSampleProvenance(sample.sampleProvenance || (sample.personalProfile ? {
        subjectKey: personalProfileSeed && personalProfileSeed.id || "personal-master",
        sourceType: "self_owned",
        personalProfile: true
      } : {}));
      const modeMismatch = sample.modeMismatch || (sample.modelResult && sample.modelResult.modeMismatch) || null;
      const noTarget = noTargetEvidenceForSample(sample);
      const analysisBlock = sampleAnalysisBlockReason(sample);
      const correctedModeLabel = modeMismatch && modeMismatch.suggestedMode === "palm" ? "手相" : "面相";
      return `
      <div class="sample-item">
        <div>
          <strong>${escapeHtml(sample.name)}</strong>
          <div class="tag-row">
            ${noTarget ? "" : `<span class="tag green">${sample.label}</span>`}
            ${modeMismatch || noTarget ? "" : `<span class="tag gold">系统建议 ${sampleTypeLabel(mode, sample.suggestedType)}</span>`}
            ${modeMismatch ? `<span class="tag red">原生建议改用${correctedModeLabel}</span>` : ""}
            ${noTarget ? `<span class="tag red">${noTarget.status === "target_unresolved" ? "目标识别未确认" : "手部与面部均未检出"}</span>` : ""}
            ${analysisBlock && !noTarget ? `<span class="tag red">${escapeHtml(analysisBlock.label)}</span>` : ""}
            ${mode === "palm" && sample.handOrientation ? `<span class="tag gold">${handOrientationTag(sample.handOrientation)}</span>` : ""}
            ${mode === "face" && sample.faceOrientation ? `<span class="tag gold">${faceOrientationTag(sample.faceOrientation)}</span>` : ""}
            ${sample.routeEvidence && Number.isFinite(Number(sample.routeEvidence.confidence)) ? `<span class="tag green">通用分流 ${percent(sample.routeEvidence.confidence)}</span>` : ""}
            ${sample.routeEvidence && sample.routeEvidence.correctedMode ? `<span class="tag green">人工纠正</span>` : ""}
            ${sample.metrics && sample.metrics.typeCalibration && sample.metrics.typeCalibration.applied ? `<span class="tag green">类型学习</span>` : ""}
            ${sample.typeCorrection ? `<span class="tag green">角度已纠正</span>` : ""}
            ${sample.rotation ? `<span class="tag green">旋转 ${rotationDegreesLabel(sample.rotation)}</span>` : ""}
            ${Array.isArray(sample.preprocessCorrections) && sample.preprocessCorrections.length ? `<span class="tag green">预处理 ${sample.preprocessCorrections.length}</span>` : ""}
            <span class="tag ${sample.quality < 0.45 ? "red" : "gold"}">置信 ${percent(sample.quality)}</span>
          </div>
          ${sample.warnings.length ? `<div class="tag-row">${sample.warnings.map((warning) => `<span class="tag red">${warning}</span>`).join("")}</div>` : ""}
          ${modeMismatch ? `<div class="case-meta">${escapeHtml(modeMismatch.label)}。本图已从当前类别的统计、覆盖度和正式分析中排除，请切换入口后重新识别。</div><button class="secondary-action compact-action" type="button" data-mode-mismatch-open="${modeMismatch.suggestedMode}">打开${correctedModeLabel}入口</button>` : ""}
          ${analysisBlock ? `<div class="case-meta">${escapeHtml(analysisBlock.detail)}</div>` : ""}
          <label class="sample-type-corrector">
            <span>${analysisBlock && analysisBlock.key === "palm_surface" ? "确认角度" : "修正角度"}</span>
            <select data-correct-sample-type-mode="${mode}" data-correct-sample-type-id="${escapeHtml(sample.id)}">
              ${sampleTypeOptions(mode, sample.type, Boolean(analysisBlock && analysisBlock.key === "palm_surface"))}
            </select>
          </label>
          <div class="sample-provenance-controls">
            <label><span>匿名人物编号</span><input type="text" maxlength="48" value="${escapeHtml(provenance.subjectKey)}" placeholder="person-001" data-sample-provenance-mode="${mode}" data-sample-provenance-id="${escapeHtml(sample.id)}" data-sample-provenance-field="subjectKey"${sample.personalProfile ? " disabled" : ""}></label>
            <label><span>样本来源</span><select data-sample-provenance-mode="${mode}" data-sample-provenance-id="${escapeHtml(sample.id)}" data-sample-provenance-field="sourceType"${sample.personalProfile ? " disabled" : ""}>${sampleProvenanceOptions(provenance.sourceType)}</select></label>
            <label><span>授权/许可说明</span><input type="text" maxlength="120" value="${escapeHtml(provenance.rightsNote)}" placeholder="授权方式或许可编号" data-sample-provenance-mode="${mode}" data-sample-provenance-id="${escapeHtml(sample.id)}" data-sample-provenance-field="rightsNote"${sample.personalProfile ? " disabled" : ""}></label>
            <span class="case-meta">${escapeHtml(sampleProvenanceStatus(provenance))}</span>
          </div>
          <div class="confidence-bar"><i style="--value:${percent(sample.quality)}"></i></div>
        </div>
        <span class="muted">${qualityLabel(sample.quality)}</span>
      </div>
    `;
    }).join(""));
  }

  function sampleTypeOptions(mode, selectedType, needsConfirmation = false) {
    return `${needsConfirmation ? `<option value="" selected disabled>请选择掌心或手背</option>` : ""}${sampleTypeCatalog(mode)
      .map((item) => `<option value="${item.value}"${item.value === selectedType ? " selected" : ""}>${item.label}</option>`)
      .join("")}`;
  }

  function sampleTypeCatalog(mode) {
    return mode === "palm"
      ? [
          { value: "palm_front", label: "掌心正面" },
          { value: "palm_side", label: "小指侧边" },
          { value: "nails", label: "指甲近照" },
          { value: "thumb", label: "拇指/虎口" },
          { value: "palm_back", label: "手背" },
          { value: "palm_main_detail", label: "三大主线近照" },
          { value: "palm_sun_wealth_detail", label: "太阳线/财运纹近照" },
          { value: "palm_helper_detail", label: "贵人线近照" },
          { value: "mixed", label: "其他手部图" }
        ]
      : [
          { value: "face_front", label: "正脸" },
          { value: "face_side", label: "侧脸" },
          { value: "face_three_quarter", label: "三分之二侧脸" },
          { value: "forehead", label: "额头/上庭" },
          { value: "eyes", label: "眉眼局部" },
          { value: "nose", label: "鼻部局部" },
          { value: "mouth_jaw", label: "口下巴局部" },
          { value: "mixed", label: "其他面部图" }
        ];
  }

  function correctSampleType(mode, sampleId, targetType) {
    if (!["palm", "face"].includes(mode) || !sampleTypeCatalog(mode).some((item) => item.value === targetType)) return;
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    const sample = samples.find((item) => item.id === sampleId);
    const surfaceReview = mode === "palm" && palmSurfaceVerificationForSample(sample) && palmSurfaceVerificationForSample(sample).reviewRequired;
    if (!sample || sample.type === targetType && !surfaceReview) return;
    const originalType = sample.type;
    sample.type = targetType;
    sample.userType = "manual_type_correction";
    sample.suggestedType = targetType;
    sample.label = sampleTypeLabel(mode, targetType);
    sample.typeCorrection = {
      from: originalType,
      to: targetType,
      correctedAt: new Date().toISOString(),
      source: surfaceReview && originalType === targetType ? "manual_surface_confirmation" : "manual_type_correction"
    };
    if (mode === "palm" && sample.modelResult) {
      sample.modelResult.palmSurfaceVerification = ["palm_front", "palm_back"].includes(targetType)
        ? {
            surface: targetType,
            candidateType: targetType,
            confidence: 1,
            reviewRequired: false,
            source: "manual_surface_confirmation",
            trustedForAnalysisGate: true
          }
        : null;
      const surfaceWarning = "系统只能确认这是张开的手";
      sample.warnings = (sample.warnings || []).filter((warning) => !String(warning).startsWith(surfaceWarning));
      sample.modelResult.warnings = (sample.modelResult.warnings || []).filter((warning) => !String(warning).startsWith(surfaceWarning));
    }
    if (sample.routeEvidence) {
      sample.routeEvidence.originalType = originalType;
      sample.routeEvidence.correctedType = targetType;
      sample.routeEvidence.typeCorrectionSource = "manual_type_correction";
    }
    const route = state.universalRoutes.find((item) => item.sampleId === sampleId);
    if (route) {
      route.sampleType = targetType;
      route.typeCorrection = sample.typeCorrection;
      route.reasons = [...route.reasons.filter((reason) => !reason.startsWith("角度纠正为")), `角度纠正为${sampleTypeLabel(mode, targetType)}`];
    }
    if (originalType !== targetType) recordSampleTypeCorrection(mode, originalType, targetType, sample);
    if (mode === "palm") updatePalmFromSamples({ autoRecognize: false });
    else updateFaceFromSamples({ autoRecognize: false });
    renderUniversalRoutes();
    const status = $(mode === "palm" ? "#palm-status" : "#face-status");
    if (status) status.textContent = surfaceReview && originalType === targetType
      ? `已确认${sampleTypeLabel(mode, targetType)}`
      : `角度已改为${sampleTypeLabel(mode, targetType)}`;
  }

  function recordSampleTypeCorrection(mode, originalType, targetType, sample) {
    const calibration = routeCalibrationSnapshot();
    const key = `${originalType}->${targetType}`;
    calibration.typeCorrections[mode][key] = (calibration.typeCorrections[mode][key] || 0) + 1;
    calibration.updatedAt = new Date().toISOString();
    calibration.typeSamples.unshift({
      correctedAt: calibration.updatedAt,
      mode,
      from: originalType,
      to: targetType,
      sampleName: sample.name,
      rawSuggestedType: sample.metrics ? sample.metrics.rawSuggestedType || sample.suggestedType : sample.suggestedType,
      suggestedType: sample.suggestedType,
      quality: sample.quality
    });
    calibration.typeSamples = calibration.typeSamples.slice(0, 80);
    state.routeCalibration = calibration;
    persistRouteCalibration();
    renderRouteCalibrationSummary();
  }

  function renderOverlaySummary(mode, sample) {
    const target = mode === "palm" ? $("#palm-overlay-summary") : $("#face-overlay-summary");
    if (!sample) {
      renderSubjectCandidateControls(mode, null);
      return;
    }
    const warnings = sample.warnings.length ? `；风险：${sample.warnings.join("、")}` : "";
    const result = sample.modelResult || {};
    const keypointCount = Array.isArray(result.keypoints) ? result.keypoints.length : 0;
    const segmentCount = Array.isArray(result.lineSegments) ? result.lineSegments.length : 0;
    const creaseCount = Array.isArray(result.creaseCandidates) ? result.creaseCandidates.length : 0;
    const centerlineCount = Array.isArray(result.creaseCenterlines) ? result.creaseCenterlines.length : 0;
    const polylineCount = Array.isArray(result.creasePolylines) ? result.creasePolylines.length : 0;
    const geometryText = keypointCount || segmentCount || creaseCount || centerlineCount || polylineCount
      ? `；模型几何：关键点 ${keypointCount} / 骨架线 ${segmentCount}${mode === "palm" ? ` / 边缘片段 ${creaseCount} / 中心线 ${centerlineCount} / 拼接长线 ${polylineCount}` : ""}`
      : "";
    const correctionCount = Array.isArray(sample.geometryCorrections) ? sample.geometryCorrections.length : 0;
    const correctionText = correctionCount ? `；人工校正 ${correctionCount}` : "";
    const rotationText = sample.rotation ? `；旋转 ${rotationDegreesLabel(sample.rotation)}` : "";
    const preprocessCount = Array.isArray(sample.preprocessCorrections) ? sample.preprocessCorrections.length : 0;
    const preprocessText = preprocessCount ? `；预处理 ${preprocessCount}` : "";
    const subjectCandidateCount = Array.isArray(result.subjectCandidates) ? result.subjectCandidates.length : 0;
    const subjectCandidateText = subjectCandidateCount > 1
      ? `；检测到 ${subjectCandidateCount} 个主体，请在下方明确选择后裁切复核`
      : "";
    const captureQuality = mode === "face" ? faceCaptureQualityForSample(sample) : null;
    const captureQualityText = captureQuality
      ? `；原生照片可测质量 ${percent(captureQuality.score)}（${captureQuality.reviewRequired ? "需重拍" : "通过"}）`
      : "";
    target.textContent = `叠加层：${sample.label}，主体框 ${sample.metrics.subject ? "已找到" : "未稳定找到"}，置信 ${percent(sample.quality)}${captureQualityText}${subjectCandidateText}${geometryText}${rotationText}${preprocessText}${correctionText}${warnings}`;
    renderSubjectCandidateControls(mode, sample);
  }

  function renderSubjectCandidateControls(mode, sample) {
    const target = $(mode === "palm" ? "#palm-subject-candidates" : "#face-subject-candidates");
    if (!target) return;
    const candidates = sample && sample.modelResult && Array.isArray(sample.modelResult.subjectCandidates)
      ? sample.modelResult.subjectCandidates
      : [];
    if (candidates.length < 2 || sample !== latestSampleForMode(mode)) {
      target.hidden = true;
      target.textContent = "";
      return;
    }
    target.hidden = false;
    setHtml(target, `
      <span class="subject-candidate-label">画面有多个主体，请确认要分析的${mode === "palm" ? "手" : "脸"}</span>
      ${candidates.map((candidate, position) => `
        <button
          class="secondary-action compact-action"
          type="button"
          data-select-subject-candidate="${position}"
          aria-pressed="${candidate.selected ? "true" : "false"}"
          title="选择后自动裁切并重新识别"
        >${escapeHtml(subjectCandidateButtonLabel(mode, candidate, position))}</button>
      `).join("")}
    `);
  }

  function subjectCandidateButtonLabel(mode, candidate, position) {
    const selected = candidate.selected ? " · 临时主选" : "";
    const confidence = percent(Number(candidate.confidence || 0));
    if (mode === "palm") {
      const side = candidate.side === "right" ? "右手候选" : candidate.side === "left" ? "左手候选" : "左右未定";
      return `候选 ${position + 1} · ${side} · ${confidence}${selected}`;
    }
    const poseLabels = {
      front: "正脸候选",
      left_three_quarter: "左侧三分之二",
      right_three_quarter: "右侧三分之二",
      left_profile: "左侧脸",
      right_profile: "右侧脸",
      unknown: "朝向未定"
    };
    return `候选 ${position + 1} · ${poseLabels[candidate.pose] || "面部候选"} · ${confidence}${selected}`;
  }

  function subjectCandidateSelectionPlan(mode, sample, candidates, position, selectedAt = new Date().toISOString()) {
    if (!["palm", "face"].includes(mode) || !sample || !Array.isArray(candidates) || !Number.isInteger(position)) return null;
    const candidate = candidates[position];
    if (!candidate || !candidate.box) return null;
    const previousPosition = candidates.findIndex((item) => item.selected);
    const updatedCandidates = candidates.map((item, index) => ({
      ...deepClone(item),
      selected: index === position,
      reviewRequired: index !== position,
      selectionStatus: index === position ? "manual_selected_pending_crop" : "not_selected"
    }));
    const selectedCandidate = updatedCandidates[position];
    const selection = {
      source: "manual_subject_candidate_selection",
      selectedAt,
      sampleId: sample.id,
      sampleName: sample.name,
      mode,
      candidateCount: updatedCandidates.length,
      previousPosition,
      selectedPosition: position,
      selectedCandidateIndex: Number.isInteger(selectedCandidate.index) ? selectedCandidate.index : position,
      candidateConfidence: roundMetric(selectedCandidate.confidence || 0),
      candidateSide: mode === "palm" ? selectedCandidate.side || "unknown" : null,
      candidatePose: mode === "face" ? selectedCandidate.pose || "unknown" : null,
      candidateBox: deepClone(selectedCandidate.box),
      cropRequested: true,
      cropApplied: false,
      status: "manual_selected_pending_crop"
    };
    return {
      candidates: updatedCandidates,
      selectedCandidate,
      subject: {
        box: deepClone(selectedCandidate.box),
        source: "manual_subject_candidate_selection"
      },
      selection
    };
  }

  function selectSubjectCandidate(mode, position) {
    if (!["palm", "face"].includes(mode) || !Number.isInteger(position)) return false;
    const sample = latestSampleForMode(mode);
    const candidates = sample && sample.modelResult && Array.isArray(sample.modelResult.subjectCandidates)
      ? sample.modelResult.subjectCandidates
      : [];
    const plan = subjectCandidateSelectionPlan(mode, sample, candidates, position);
    if (!plan) return false;
    const selection = plan.selection;
    sample.modelResult.subjectCandidates = plan.candidates;
    sample.subjectSelection = selection;
    sample.subjectSelectionHistory = [...(Array.isArray(sample.subjectSelectionHistory) ? sample.subjectSelectionHistory : []), selection].slice(-12);
    sample.modelResult.subject = plan.subject;
    sample.metrics = mergeNativeSubjectMetrics(sample.metrics, sample.modelResult.subject);
    sample.warnings = Array.from(new Set([...(sample.warnings || []), "主体已人工选择，正在裁切复核"]));
    sample.modelResult.warnings = Array.from(new Set([...(sample.modelResult.warnings || []), "主体已人工选择，正在裁切复核"]));
    redrawLatestPreview(mode, sample.modelResult);
    const cropped = preprocessCurrentImage(mode, "fit_subject", { subjectSelection: selection });
    if (!cropped) {
      selection.status = "manual_selected_crop_not_needed";
      selection.cropRequested = false;
      sample.warnings = Array.from(new Set([...(sample.warnings || []), "主体已人工确认"]));
      renderSampleList(mode);
      if (mode === "palm") renderPalmReport();
      else renderFaceReport();
      renderOverlaySummary(mode, sample);
      const status = $(mode === "palm" ? "#palm-status" : "#face-status");
      if (status) status.textContent = `已确认候选 ${position + 1}，当前无需继续裁切`;
    }
    return true;
  }

  function setPreviewBaseCanvas(mode, sourceCanvas) {
    if (!sourceCanvas) return;
    const base = document.createElement("canvas");
    base.width = sourceCanvas.width;
    base.height = sourceCanvas.height;
    const context = base.getContext("2d", { willReadFrequently: true });
    context.drawImage(sourceCanvas, 0, 0, base.width, base.height);
    state.previewBaseCanvases[mode] = base;
  }

  function latestSampleForMode(mode) {
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    return samples[samples.length - 1] || null;
  }

  function canvasForMode(mode) {
    return $(mode === "palm" ? "#palm-canvas" : "#face-canvas");
  }

  function redrawLatestPreview(mode, modelResult = null) {
    const sample = latestSampleForMode(mode);
    if (!sample) return;
    redrawPreviewForSample(mode, sample, modelResult || sample.modelResult);
    renderOverlaySummary(mode, sample);
  }

  function redrawPreviewForSample(mode, sample, modelResult = null) {
    const canvas = canvasForMode(mode);
    const base = state.previewBaseCanvases[mode];
    if (!canvas || !sample) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (base) {
      canvas.width = base.width;
      canvas.height = base.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(base, 0, 0, canvas.width, canvas.height);
    }
    drawRecognitionOverlay(canvas, mode, sample.metrics, sample.type, modelResult || sample.modelResult);
  }

  function drawRecognitionOverlay(canvas, mode, metrics, type, modelResult = null) {
    const context = canvas.getContext("2d");
    const { width, height } = canvas;
    context.save();
    context.lineWidth = Math.max(2, Math.round(Math.min(width, height) / 220));
    context.font = `${Math.max(13, Math.round(width / 44))}px -apple-system, BlinkMacSystemFont, sans-serif`;
    context.textBaseline = "top";
    drawSubjectOverlay(context, width, height, metrics);
    drawSubjectCandidateOverlay(context, width, height, modelResult);
    if (state.geometryOverlay[mode].guide && !(mode==="face" && state.faceHairlineCalibrationSampleId)) drawGuideRegions(context, width, height, mode, type);
    if (state.geometryOverlay[mode].model) drawModelGeometryOverlay(context, width, height, mode, modelResult);
    drawOverlayLabel(context, width, mode, type, metrics);
    context.restore();
  }

  function drawSubjectOverlay(context, width, height, metrics) {
    if (!metrics.subject) return;
    const box = metrics.subject.box;
    const x = box.x * width;
    const y = box.y * height;
    const w = box.width * width;
    const h = box.height * height;
    context.strokeStyle = "rgba(27, 107, 98, 0.95)";
    context.fillStyle = "rgba(27, 107, 98, 0.12)";
    context.strokeRect(x, y, w, h);
    context.fillRect(x, y, w, h);
    context.setLineDash([8, 8]);
    context.strokeStyle = "rgba(27, 107, 98, 0.55)";
    context.beginPath();
    context.moveTo(width / 2, 0);
    context.lineTo(width / 2, height);
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
    context.setLineDash([]);
  }

  function drawSubjectCandidateOverlay(context, width, height, modelResult) {
    const candidates = modelResult && Array.isArray(modelResult.subjectCandidates)
      ? modelResult.subjectCandidates
      : [];
    if (candidates.length < 2) return;
    candidates.filter((candidate) => !candidate.selected).forEach((candidate, index) => {
      const box = candidate && candidate.box;
      if (!box) return;
      const x = box.x * width;
      const y = box.y * height;
      const w = box.width * width;
      const h = box.height * height;
      context.save();
      context.setLineDash([12, 8]);
      context.lineWidth = Math.max(3, Math.round(Math.min(width, height) / 180));
      context.strokeStyle = "rgba(184, 83, 30, 0.98)";
      context.fillStyle = "rgba(184, 83, 30, 0.08)";
      context.strokeRect(x, y, w, h);
      context.fillRect(x, y, w, h);
      context.setLineDash([]);
      drawCanvasTag(context, `待复核主体 ${index + 2}`, x, y);
      context.restore();
    });
  }

  function drawGuideRegions(context, width, height, mode, type) {
    const regions = overlayRegions(mode, type);
    regions.forEach((region) => {
      context.strokeStyle = region.color || "rgba(42, 95, 155, 0.9)";
      context.fillStyle = region.fill || "rgba(42, 95, 155, 0.1)";
      if (region.kind === "rect") {
        const x = region.x * width;
        const y = region.y * height;
        const w = region.w * width;
        const h = region.h * height;
        context.strokeRect(x, y, w, h);
        context.fillRect(x, y, w, h);
        drawCanvasTag(context, region.label, x, y);
      } else if (region.kind === "line") {
        context.beginPath();
        context.moveTo(region.x1 * width, region.y1 * height);
        context.lineTo(region.x2 * width, region.y2 * height);
        context.stroke();
        drawCanvasTag(context, region.label, region.x1 * width, region.y1 * height);
      } else if (region.kind === "arc") {
        context.beginPath();
        context.ellipse(region.cx * width, region.cy * height, region.rx * width, region.ry * height, region.rotate || 0, region.start, region.end);
        context.stroke();
        drawCanvasTag(context, region.label, (region.cx - region.rx) * width, (region.cy - region.ry) * height);
      }
    });
  }

  function drawCanvasTag(context, label, x, y) {
    if (!label) return;
    const padding = 5;
    const textWidth = context.measureText(label).width;
    const boxHeight = 22;
    const canvasWidth = context.canvas ? context.canvas.width : x + textWidth + padding * 2;
    const safeX = clamp(x, 0, Math.max(0, canvasWidth - textWidth - padding * 2));
    const safeY = Math.max(0, y - boxHeight);
    context.save();
    context.fillStyle = "rgba(255, 255, 255, 0.86)";
    context.fillRect(safeX, safeY, textWidth + padding * 2, boxHeight);
    context.fillStyle = "#1e2528";
    context.fillText(label, safeX + padding, safeY + 4);
    context.restore();
  }

  function drawModelGeometryOverlay(context, width, height, mode, modelResult) {
    if (!modelResult || typeof modelResult !== "object") return;
    const segments = Array.isArray(modelResult.lineSegments) ? modelResult.lineSegments : [];
    const keypoints = Array.isArray(modelResult.keypoints) ? modelResult.keypoints : [];
    const creaseCandidates = mode === "palm" && Array.isArray(modelResult.creaseCandidates) ? modelResult.creaseCandidates : [];
    const creaseCenterlines = mode === "palm" && Array.isArray(modelResult.creaseCenterlines) ? modelResult.creaseCenterlines : [];
    const creasePolylines = mode === "palm" && Array.isArray(modelResult.creasePolylines) ? modelResult.creasePolylines : [];
    if (!segments.length && !keypoints.length && !creaseCandidates.length && !creaseCenterlines.length && !creasePolylines.length) return;
    context.save();
    if (mode==="face" && state.faceHairlineCalibrationSampleId) {
      keypoints.filter((p) => p.key==="hairline_center" || p.key==="brow_center").forEach((p) => drawModelKeypoint(context, width, height, p));
      context.restore();
      return;
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    creaseCandidates.forEach((candidate) => drawCreaseCandidate(context, width, height, candidate));
    creaseCenterlines.forEach((candidate) => drawCreaseCenterline(context, width, height, candidate));
    creasePolylines.forEach((candidate) => drawCreasePolyline(context, width, height, candidate));
    if (mode === "palm" && state.geometryOverlay.palm.edit) {
      creasePolylines.forEach((candidate) => drawCreasePolylineHandles(context, width, height, candidate));
    }
    segments.forEach((segment) => drawModelLineSegment(context, width, height, mode, segment));
    keypoints.forEach((point) => drawModelKeypoint(context, width, height, point));
    context.restore();
  }

  function drawCreaseCandidate(context, width, height, candidate) {
    const points = candidate && Array.isArray(candidate.points)
      ? candidate.points.filter((point) => point && isUnitCoordinate(point.x) && isUnitCoordinate(point.y))
      : [];
    if (points.length < 2) return;
    const confidence = Number(candidate.confidence || 0);
    context.save();
    context.lineWidth = Math.max(2, Math.round(Math.min(width, height) / 235));
    context.strokeStyle = confidence >= 0.6
      ? "rgba(8, 117, 128, 0.96)"
      : "rgba(17, 139, 126, 0.82)";
    if (confidence < 0.48) context.setLineDash([7, 5]);
    context.beginPath();
    context.moveTo(points[0].x * width, points[0].y * height);
    points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
    context.stroke();
    context.restore();
  }

  function drawCreaseCenterline(context, width, height, candidate) {
    const points = candidate && Array.isArray(candidate.points)
      ? candidate.points.filter((point) => point && isUnitCoordinate(point.x) && isUnitCoordinate(point.y))
      : [];
    if (points.length < 2) return;
    const confidence = Number(candidate.confidence || 0);
    context.save();
    context.lineWidth = Math.max(3, Math.round(Math.min(width, height) / 190));
    context.strokeStyle = confidence >= 0.46
      ? "rgba(0, 101, 166, 0.96)"
      : "rgba(28, 122, 172, 0.78)";
    if (confidence < 0.46) context.setLineDash([9, 6]);
    context.beginPath();
    context.moveTo(points[0].x * width, points[0].y * height);
    points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
    context.stroke();
    context.restore();
  }

  function drawCreasePolyline(context, width, height, candidate) {
    const points = candidate && Array.isArray(candidate.points)
      ? candidate.points.filter((point) => point && isUnitCoordinate(point.x) && isUnitCoordinate(point.y))
      : [];
    if (points.length < 3) return;
    const reviewStatus = candidate.reviewStatus || "pending";
    const confidence = Number(candidate.confidence || 0);
    context.save();
    context.lineWidth = Math.max(4, Math.round(Math.min(width, height) / 155));
    context.strokeStyle = reviewStatus === "accepted"
      ? "rgba(30, 120, 72, 0.98)"
      : reviewStatus === "rejected"
        ? "rgba(105, 111, 115, 0.62)"
        : "rgba(166, 52, 112, 0.94)";
    if (reviewStatus !== "accepted" || confidence < 0.44) context.setLineDash(reviewStatus === "rejected" ? [3, 8] : [12, 7]);
    context.beginPath();
    context.moveTo(points[0].x * width, points[0].y * height);
    points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
    context.stroke();
    context.restore();
  }

  function editablePolylinePointIndexes(candidate) {
    const points = candidate && Array.isArray(candidate.points) ? candidate.points : [];
    if (points.length < 3 || candidate.reviewStatus === "rejected") return [];
    const maximumHandles = 7;
    const step = Math.max(1, Math.ceil((points.length - 1) / (maximumHandles - 1)));
    const indexes = [];
    for (let index = 0; index < points.length; index += step) indexes.push(index);
    if (indexes[indexes.length - 1] !== points.length - 1) indexes.push(points.length - 1);
    return Array.from(new Set(indexes)).slice(0, maximumHandles);
  }

  function drawCreasePolylineHandles(context, width, height, candidate) {
    const points = candidate && Array.isArray(candidate.points) ? candidate.points : [];
    const indexes = editablePolylinePointIndexes(candidate);
    if (!indexes.length) return;
    const radius = Math.max(4, Math.round(Math.min(width, height) / 125));
    context.save();
    context.fillStyle = "rgba(255, 255, 255, 0.96)";
    context.strokeStyle = candidate.reviewStatus === "accepted" ? "rgba(30, 120, 72, 0.98)" : "rgba(166, 52, 112, 0.98)";
    context.lineWidth = Math.max(2, Math.round(radius / 2));
    indexes.forEach((pointIndex) => {
      const point = points[pointIndex];
      if (!point || !isUnitCoordinate(point.x) || !isUnitCoordinate(point.y)) return;
      context.beginPath();
      context.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
    context.restore();
  }

  function drawModelLineSegment(context, width, height, mode, segment) {
    if (!segment || !isUnitCoordinate(segment.x1) || !isUnitCoordinate(segment.y1) || !isUnitCoordinate(segment.x2) || !isUnitCoordinate(segment.y2)) return;
    const confidence = Number(segment.confidence || 0);
    const color = modelGeometryColor(mode, segment.key, confidence);
    const x1 = segment.x1 * width;
    const y1 = segment.y1 * height;
    const x2 = segment.x2 * width;
    const y2 = segment.y2 * height;
    context.save();
    context.lineWidth = Math.max(3, Math.round(Math.min(width, height) / 170));
    context.strokeStyle = color.stroke;
    context.fillStyle = color.fill;
    if (confidence && confidence < 0.5) context.setLineDash([10, 7]);
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
    context.setLineDash([]);
    if (!segment.hideLabel) {
      drawCanvasTag(context, `${segment.label || segment.key}${confidence ? ` ${percent(confidence)}` : ""}`, (x1 + x2) / 2, (y1 + y2) / 2);
    }
    context.restore();
  }

  function drawModelKeypoint(context, width, height, point) {
    if (!point || !isUnitCoordinate(point.x) || !isUnitCoordinate(point.y)) return;
    const x = point.x * width;
    const y = point.y * height;
    const radius = Math.max(4, Math.round(Math.min(width, height) / 140));
    context.save();
    context.fillStyle = "rgba(250, 204, 21, 0.92)";
    context.strokeStyle = "rgba(30, 37, 40, 0.84)";
    context.lineWidth = Math.max(1.5, Math.round(radius / 2));
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (["detail_zone", "feature", "profile", "measure"].includes(point.role)) {
      drawCanvasTag(context, modelKeypointLabel(point.key), x + radius + 3, y);
    }
    context.restore();
  }

  function modelGeometryColor(mode, key, confidence) {
    if (mode === "palm") {
      if (["sun_line", "wealth_lines"].includes(key)) return { stroke: "rgba(185, 118, 21, 0.96)", fill: "rgba(185, 118, 21, 0.14)" };
      if (["helper_lines"].includes(key)) return { stroke: "rgba(27, 107, 98, 0.96)", fill: "rgba(27, 107, 98, 0.14)" };
      if (["life_line", "head_line", "heart_line"].includes(key)) return { stroke: "rgba(155, 63, 57, 0.96)", fill: "rgba(155, 63, 57, 0.14)" };
    }
    if (confidence && confidence < 0.5) return { stroke: "rgba(185, 118, 21, 0.96)", fill: "rgba(185, 118, 21, 0.14)" };
    return { stroke: "rgba(42, 95, 155, 0.96)", fill: "rgba(42, 95, 155, 0.14)" };
  }

  function modelKeypointLabel(key) {
    const labels = {
      palm_center: "掌心",
      wrist_center: "腕口",
      thumb_base: "拇指根",
      sun_mount: "太阳丘",
      mercury_mount: "水星丘",
      helper_zone: "贵人区",
      face_top: "面部顶点",
      hairline_center: "发际中点",
      brow_center: "眉心",
      left_eye: "左眼",
      right_eye: "右眼",
      nose_bridge: "山根",
      nose_tip: "鼻准",
      nose_base: "鼻基底",
      upper_lip: "上唇缘",
      mouth_center: "口部",
      lower_lip: "下唇缘",
      jaw_center: "颏点",
      profile_bridge: "侧轮廓"
    };
    return labels[key] || key;
  }

  function isUnitCoordinate(value) {
    return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1;
  }

  function bindGeometryCanvas(mode, canvas) {
    if (!canvas) return;
    canvas.addEventListener("pointerdown", (event) => {
      const overlay = state.geometryOverlay[mode];
      if (!overlay || !overlay.edit || !overlay.model) return;
      const sample = mode === "face" && state.faceHairlineCalibrationSampleId
        ? state.faceSamples.find((item) => item.id === state.faceHairlineCalibrationSampleId)
        : latestSampleForMode(mode);
      if (!sample || !sample.modelResult) return;
      const point = canvasPointerPoint(canvas, event);
      if (mode === "face" && state.faceHairlineCalibrationSampleId === sample.id) {
        const check = faceThirdsRuntime.validPoint(sample.modelResult, point);
        if (!check.valid) {
          const status = $("#face-status");
          if (status) status.textContent = check.reason;
          return;
        }
      }
      const handle = nearestGeometryHandle(sample.modelResult, point, canvas);
      if (!handle) return;
      storeOriginalModelGeometry(sample);
      state.activeGeometryDrag = {
        mode,
        sampleId: sample.id,
        sampleName: sample.name,
        handle,
        before: geometryHandleValue(sample.modelResult, handle)
      };
      applyGeometryHandle(sample.modelResult, handle, point);
      redrawPreviewForSample(mode, sample, sample.modelResult);
      canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    canvas.addEventListener("pointermove", (event) => {
      const drag = state.activeGeometryDrag;
      if (!drag || drag.mode !== mode) return;
      const sample = mode === "face" && state.faceHairlineCalibrationSampleId
        ? state.faceSamples.find((item) => item.id === state.faceHairlineCalibrationSampleId)
        : latestSampleForMode(mode);
      if (!sample || sample.id !== drag.sampleId) return;
      const point = canvasPointerPoint(canvas, event);
      if (mode === "face" && state.faceHairlineCalibrationSampleId === sample.id && !faceThirdsRuntime.validPoint(sample.modelResult, point).valid) return;
      applyGeometryHandle(sample.modelResult, drag.handle, point);
      redrawPreviewForSample(mode, sample, sample.modelResult);
      event.preventDefault();
    });
    const finishDrag = (event) => {
      const drag = state.activeGeometryDrag;
      if (!drag || drag.mode !== mode) return;
      const sample = mode === "face" && state.faceHairlineCalibrationSampleId
        ? state.faceSamples.find((item) => item.id === state.faceHairlineCalibrationSampleId)
        : latestSampleForMode(mode);
      if (sample && sample.id === drag.sampleId) {
        recordGeometryCorrection(mode, sample, drag);
        redrawPreviewForSample(mode, sample, sample.modelResult);
        renderOverlaySummary(mode, sample);
        renderModelDebug(sample);
        if (mode === "face") renderFaceReport();
        if (mode === "palm") renderPalmReport();
      }
      state.activeGeometryDrag = null;
      canvas.releasePointerCapture && canvas.releasePointerCapture(event.pointerId);
      event.preventDefault();
    };
    canvas.addEventListener("pointerup", finishDrag);
    canvas.addEventListener("pointercancel", finishDrag);
  }

  function canvasPointerPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1)
    };
  }

  function nearestGeometryHandle(modelResult, point, canvas) {
    const hairlineOnly = Boolean(state.faceHairlineCalibrationSampleId);
    const handles = geometryHandles(modelResult).filter((handle) => !hairlineOnly || (handle.kind === "keypoint" && handle.key === "hairline_center"));
    if (!handles.length) return null;
    if (hairlineOnly) return { ...handles[0], distance: 0 };
    const threshold = Math.max(18, Math.min(canvas.width, canvas.height) / 22);
    let best = null;
    handles.forEach((handle) => {
      const distance = Math.hypot((handle.x - point.x) * canvas.width, (handle.y - point.y) * canvas.height);
      if (distance <= threshold && (!best || distance < best.distance)) best = { ...handle, distance };
    });
    return best;
  }

  function geometryHandles(modelResult) {
    const handles = [];
    (Array.isArray(modelResult.keypoints) ? modelResult.keypoints : []).forEach((point, index) => {
      if (isUnitCoordinate(point.x) && isUnitCoordinate(point.y)) {
        handles.push({ kind: "keypoint", index, key: point.key, x: Number(point.x), y: Number(point.y) });
      }
    });
    (Array.isArray(modelResult.lineSegments) ? modelResult.lineSegments : []).forEach((segment, index) => {
      if (isUnitCoordinate(segment.x1) && isUnitCoordinate(segment.y1)) {
        handles.push({ kind: "segment", index, key: segment.key, endpoint: "start", x: Number(segment.x1), y: Number(segment.y1) });
      }
      if (isUnitCoordinate(segment.x2) && isUnitCoordinate(segment.y2)) {
        handles.push({ kind: "segment", index, key: segment.key, endpoint: "end", x: Number(segment.x2), y: Number(segment.y2) });
      }
    });
    (Array.isArray(modelResult.creasePolylines) ? modelResult.creasePolylines : []).forEach((polyline, polylineIndex) => {
      editablePolylinePointIndexes(polyline).forEach((pointIndex) => {
        const point = polyline.points[pointIndex];
        if (point && isUnitCoordinate(point.x) && isUnitCoordinate(point.y)) {
          handles.push({
            kind: "polyline",
            polylineIndex,
            pointIndex,
            key: polyline.key,
            endpoint: `point_${pointIndex}`,
            x: Number(point.x),
            y: Number(point.y)
          });
        }
      });
    });
    return handles;
  }

  function geometryHandleValue(modelResult, handle) {
    if (handle.kind === "keypoint") {
      const point = modelResult.keypoints[handle.index];
      return point ? { x: roundMetric(point.x), y: roundMetric(point.y) } : null;
    }
    if (handle.kind === "polyline") {
      const polyline = modelResult.creasePolylines && modelResult.creasePolylines[handle.polylineIndex];
      const point = polyline && polyline.points ? polyline.points[handle.pointIndex] : null;
      return point ? { x: roundMetric(point.x), y: roundMetric(point.y) } : null;
    }
    const segment = modelResult.lineSegments[handle.index];
    if (!segment) return null;
    return handle.endpoint === "start"
      ? { x: roundMetric(segment.x1), y: roundMetric(segment.y1) }
      : { x: roundMetric(segment.x2), y: roundMetric(segment.y2) };
  }

  function applyGeometryHandle(modelResult, handle, point) {
    if (handle.kind === "keypoint") {
      const target = modelResult.keypoints[handle.index];
      if (!target) return;
      target.x = roundMetric(point.x);
      target.y = roundMetric(point.y);
      target.confidence = Math.max(Number(target.confidence || 0), 0.92);
      target.source = "manual_geometry";
      return;
    }
    if (handle.kind === "polyline") {
      const polyline = modelResult.creasePolylines && modelResult.creasePolylines[handle.polylineIndex];
      const target = polyline && polyline.points ? polyline.points[handle.pointIndex] : null;
      if (!target) return;
      target.x = roundMetric(point.x);
      target.y = roundMetric(point.y);
      polyline.reviewStatus = "accepted";
      polyline.reviewedAt = new Date().toISOString();
      polyline.reviewSource = "manual_control_point";
      polyline.geometrySource = "manual_control_point";
      invalidateCreaseSemanticReview(polyline, "manual_control_point_changed");
      return;
    }
    const segment = modelResult.lineSegments[handle.index];
    if (!segment) return;
    if (handle.endpoint === "start") {
      segment.x1 = roundMetric(point.x);
      segment.y1 = roundMetric(point.y);
    } else {
      segment.x2 = roundMetric(point.x);
      segment.y2 = roundMetric(point.y);
    }
    segment.confidence = Math.max(Number(segment.confidence || 0), 0.9);
    segment.source = "manual_geometry";
  }

  function storeOriginalModelGeometry(sample) {
    if (sample.originalModelGeometry || !sample.modelResult) return;
    sample.originalModelGeometry = {
      keypoints: deepClone(sample.modelResult.keypoints || []),
      lineSegments: deepClone(sample.modelResult.lineSegments || []),
      creasePolylines: deepClone(sample.modelResult.creasePolylines || [])
    };
  }

  function recordGeometryCorrection(mode, sample, drag) {
    const after = geometryHandleValue(sample.modelResult, drag.handle);
    if (!drag.before || !after || Math.hypot(after.x - drag.before.x, after.y - drag.before.y) < 0.002) return;
    const correction = {
      source: "manual_drag",
      correctedAt: new Date().toISOString(),
      sampleId: sample.id,
      sampleName: sample.name,
      modelVersion: sample.modelVersion,
      targetKind: drag.handle.kind,
      targetKey: drag.handle.key,
      endpoint: drag.handle.endpoint || null,
      pointIndex: Number.isInteger(drag.handle.pointIndex) ? drag.handle.pointIndex : null,
      before: drag.before,
      after
    };
    if (mode === "face" && drag.handle.kind === "keypoint" && drag.handle.key === "hairline_center" && state.faceHairlineCalibrationSampleId === sample.id) {
      faceThirdsRuntime.prepareCorrection(correction);
      const point = sample.modelResult.keypoints[drag.handle.index];
      if (point) point.source = "manual_hairline_proposed";
      state.faceHairlineCalibrationSampleId = null;
      const status = $("#face-status");
      if (status) status.textContent = "发际候选点已放好；请在面相报告里看三庭候选比例，再做第二轮确认。";
    }
    if (!Array.isArray(sample.geometryCorrections)) sample.geometryCorrections = [];
    sample.geometryCorrections.push(correction);
    sample.geometryCorrections = sample.geometryCorrections.slice(-120);
    state.geometryCorrections[mode].push(correction);
    state.geometryCorrections[mode] = state.geometryCorrections[mode].slice(-200);
    invalidateDerivedData();
    renderGeometryTrainingPanel();
  }

  function clearGeometryCorrections(mode) {
    const sample = latestSampleForMode(mode);
    if (!sample) return;
    if (sample.originalModelGeometry && sample.modelResult) {
      sample.modelResult.keypoints = deepClone(sample.originalModelGeometry.keypoints || []);
      sample.modelResult.lineSegments = deepClone(sample.originalModelGeometry.lineSegments || []);
      sample.modelResult.creasePolylines = deepClone(sample.originalModelGeometry.creasePolylines || []);
    }
    sample.geometryCorrections = [];
    sample.creaseGeometryEdits = [];
    delete sample.originalModelGeometry;
    state.geometryCorrections[mode] = [];
    if (mode === "face") state.faceHairlineCalibrationSampleId = null;
    if (mode === "palm") {
      state.creaseReconnectSelection = [];
      state.creaseEditorNotice = "已清除当前掌照的几何校正、拆分和重连。";
    }
    invalidateDerivedData();
    redrawPreviewForSample(mode, sample, sample.modelResult);
    renderOverlaySummary(mode, sample);
    renderModelDebug(sample);
    renderGeometryTrainingPanel();
    if (mode === "face") renderFaceReport();
    if (mode === "palm") renderPalmReport();
  }

  function rotateCurrentImage(mode, degrees) {
    if (!["palm", "face"].includes(mode)) return false;
    const delta = normalizeRotationDegrees(degrees);
    if (!delta) return false;
    const canvas = canvasForMode(mode);
    const sample = latestSampleForMode(mode);
    const status = $(mode === "palm" ? "#palm-status" : "#face-status");
    if (!canvas || !sample) {
      if (status) status.textContent = mode === "palm" ? "先上传手相图" : "先上传面相图";
      return false;
    }
    const sourceCanvas = state.previewBaseCanvases[mode] || canvas;
    if (!sourceCanvas.width || !sourceCanvas.height) {
      if (status) status.textContent = "当前图片不可旋转";
      return false;
    }
    const rotated = rotatedCanvas(sourceCanvas, delta);
    const result = copyCanvasToCanvas(rotated, canvas, $(mode === "palm" ? "#palm-empty" : "#face-empty"));
    if (mode === "palm") state.palmImage = result;
    else state.faceImage = result;
    setPreviewBaseCanvas(mode, canvas);
    reanalyzeRotatedSample(mode, sample, canvas, delta);
    updateSampleThumbnail(sample, canvas, "manual_rotation");
    drawRecognitionOverlay(canvas, mode, sample.metrics, sample.type, sample.modelResult);
    renderOverlaySummary(mode, sample);
    renderModelDebug(sample);
    if (mode === "palm") updatePalmFromSamples();
    else updateFaceFromSamples();
    if (status) status.textContent = `已${rotationDeltaLabel(delta)}并重新识别`;
    return true;
  }

  function rotatedCanvas(sourceCanvas, degrees) {
    const delta = normalizeRotationDegrees(degrees);
    const rightAngle = Math.abs(delta) === 90;
    const target = document.createElement("canvas");
    target.width = rightAngle ? sourceCanvas.height : sourceCanvas.width;
    target.height = rightAngle ? sourceCanvas.width : sourceCanvas.height;
    const context = target.getContext("2d", { willReadFrequently: true });
    context.save();
    context.translate(target.width / 2, target.height / 2);
    context.rotate((delta * Math.PI) / 180);
    context.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
    context.restore();
    return target;
  }

  function reanalyzeRotatedSample(mode, sample, canvas, degrees) {
    const previousRotation = normalizeTotalRotation(sample.rotation || 0);
    const totalRotation = normalizeTotalRotation(previousRotation + degrees);
    const clearedGeometryCorrections = Array.isArray(sample.geometryCorrections) ? sample.geometryCorrections.length : 0;
    const clearedCreaseGeometryEdits = Array.isArray(sample.creaseGeometryEdits) ? sample.creaseGeometryEdits.length : 0;
    const metrics = refreshSampleRecognition(mode, sample, canvas);
    const correction = {
      source: "manual_rotation",
      rotatedAt: new Date().toISOString(),
      sampleId: sample.id,
      sampleName: sample.name,
      degrees,
      previousDegrees: previousRotation,
      totalDegrees: totalRotation,
      clearedGeometryCorrections,
      clearedCreaseGeometryEdits
    };
    sample.rotation = totalRotation;
    sample.rotationCorrections = [...(Array.isArray(sample.rotationCorrections) ? sample.rotationCorrections : []), correction].slice(-24);
    clearSampleGeometryAfterImageTransform(mode, sample);
    syncTransformedRouteRecord(mode, sample, metrics, canvas, `旋转校正为${rotationDegreesLabel(sample.rotation)}`, "旋转校正为");
    renderGeometryTrainingPanel();
    return sample;
  }

  function preprocessCurrentImage(mode, action, options = {}) {
    if (!["palm", "face"].includes(mode)) return false;
    if (!["auto_prepare", "fit_subject", "enhance"].includes(action)) return false;
    const canvas = canvasForMode(mode);
    const sample = latestSampleForMode(mode);
    const status = $(mode === "palm" ? "#palm-status" : "#face-status");
    if (!canvas || !sample) {
      if (status) status.textContent = mode === "palm" ? "先上传手相图" : "先上传面相图";
      return false;
    }
    const sourceCanvas = state.previewBaseCanvases[mode] || canvas;
    if (!sourceCanvas.width || !sourceCanvas.height) {
      if (status) status.textContent = "当前图片不可预处理";
      return false;
    }
    const sourceMetrics = sample.metrics || analyzeImage(sourceCanvas, mode);
    const transformed = action === "auto_prepare"
      ? autoPreparedCanvas(sourceCanvas, sourceMetrics, mode)
      : (action === "fit_subject"
          ? subjectFocusCanvas(sourceCanvas, sourceMetrics, mode)
          : enhancedCanvas(sourceCanvas, sourceMetrics));
    if (!transformed) {
      if (status) {
        status.textContent = action === "auto_prepare"
          ? "当前图片暂无可优化项"
          : (action === "fit_subject" && sourceMetrics.subject
          ? "主体已接近铺满，无需裁切"
          : (action === "fit_subject" ? "主体不稳定，先自动增强或换图" : "当前图片不可增强"));
      }
      return false;
    }
    if (options.subjectSelection && action === "fit_subject") {
      transformed.meta = {
        ...(transformed.meta || {}),
        source: "manual_subject_candidate_crop",
        subjectSelection: {
          selectedPosition: options.subjectSelection.selectedPosition,
          selectedCandidateIndex: options.subjectSelection.selectedCandidateIndex,
          candidateCount: options.subjectSelection.candidateCount,
          candidateConfidence: options.subjectSelection.candidateConfidence
        }
      };
      options.subjectSelection.cropApplied = true;
      options.subjectSelection.status = "manual_selected_and_cropped";
    }
    const result = copyCanvasToCanvas(transformed.canvas, canvas, $(mode === "palm" ? "#palm-empty" : "#face-empty"));
    if (mode === "palm") state.palmImage = result;
    else state.faceImage = result;
    setPreviewBaseCanvas(mode, canvas);
    reanalyzePreprocessedSample(mode, sample, canvas, action, transformed.meta);
    updateSampleThumbnail(sample, canvas, action);
    drawRecognitionOverlay(canvas, mode, sample.metrics, sample.type, sample.modelResult);
    renderOverlaySummary(mode, sample);
    renderModelDebug(sample);
    if (mode === "palm") updatePalmFromSamples();
    else updateFaceFromSamples();
    if (status) {
      status.textContent = options.subjectSelection
        ? `已选择候选 ${options.subjectSelection.selectedPosition + 1}、裁切并重新识别`
        : `已${preprocessActionLabel(action)}并重新识别`;
    }
    return true;
  }

  function autoPreparedCanvas(sourceCanvas, sourceMetrics, mode) {
    if (!sourceCanvas || !sourceMetrics) return null;
    let workingCanvas = sourceCanvas;
    let workingMetrics = sourceMetrics;
    const steps = [];
    if (shouldEnhanceImage(workingMetrics) || (!steps.length && Number(workingMetrics.quality || 0) < 0.58)) {
      const enhanced = enhancedCanvas(workingCanvas, workingMetrics);
      if (enhanced) {
        workingCanvas = enhanced.canvas;
        steps.push({ action: "enhance", ...enhanced.meta });
        workingMetrics = analyzeImage(workingCanvas, mode);
      }
    }
    if (!steps.length) return null;
    return {
      canvas: workingCanvas,
      meta: {
        source: "auto_image_prepare",
        steps,
        stepCount: steps.length,
        qualityBefore: roundMetric(sourceMetrics.quality || 0),
        qualityPreviewAfter: roundMetric(workingMetrics.quality || 0),
        warningsBefore: sourceMetrics.warnings || [],
        warningsPreviewAfter: workingMetrics.warnings || []
      }
    };
  }

  function shouldEnhanceImage(metrics) {
    if (!metrics) return false;
    const brightness = Number(metrics.brightness || 0);
    const contrast = Number(metrics.contrast || 0);
    const lineClarity = Number(metrics.lineClarity || 0);
    return brightness < 0.42 || brightness > 0.72 || contrast < 0.14 || lineClarity < 0.26;
  }

  function subjectFocusCanvas(sourceCanvas, metrics, mode) {
    if (!metrics || !metrics.subject || !metrics.subject.box) return null;
    const { width, height } = sourceCanvas;
    const box = metrics.subject.box;
    const marginX = mode === "palm" ? 0.2 : 0.16;
    const marginY = mode === "palm" ? 0.14 : 0.18;
    const cropX = clamp(box.x - box.width * marginX, 0, 1);
    const cropY = clamp(box.y - box.height * marginY, 0, 1);
    const cropRight = clamp(box.x + box.width * (1 + marginX), 0, 1);
    const cropBottom = clamp(box.y + box.height * (1 + marginY), 0, 1);
    const sx = Math.max(0, Math.floor(cropX * width));
    const sy = Math.max(0, Math.floor(cropY * height));
    const sw = Math.max(8, Math.min(width - sx, Math.ceil((cropRight - cropX) * width)));
    const sh = Math.max(8, Math.min(height - sy, Math.ceil((cropBottom - cropY) * height)));
    if (sw >= width * 0.96 && sh >= height * 0.96) return null;
    const scale = Math.min(900 / sw, 1100 / sh, 2.2);
    const target = document.createElement("canvas");
    target.width = Math.max(1, Math.round(sw * scale));
    target.height = Math.max(1, Math.round(sh * scale));
    const context = target.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, target.width, target.height);
    return {
      canvas: target,
      meta: {
        source: "manual_subject_crop",
        crop: {
          x: roundMetric(sx / width),
          y: roundMetric(sy / height),
          width: roundMetric(sw / width),
          height: roundMetric(sh / height)
        },
        scale: roundMetric(scale),
        subjectAreaBefore: roundMetric(metrics.subjectAreaRatio || 0),
        subjectCenterednessBefore: roundMetric(metrics.subjectCenteredness || 0)
      }
    };
  }

  function enhancedCanvas(sourceCanvas, metrics) {
    if (!metrics) return null;
    const target = document.createElement("canvas");
    target.width = sourceCanvas.width;
    target.height = sourceCanvas.height;
    const context = target.getContext("2d", { willReadFrequently: true });
    context.drawImage(sourceCanvas, 0, 0, target.width, target.height);
    const imageData = context.getImageData(0, 0, target.width, target.height);
    const data = imageData.data;
    const brightnessShift = clamp(0.54 - Number(metrics.brightness || 0.54), -0.18, 0.18);
    const contrastScale = roundMetric(clamp(1 + (0.18 - Number(metrics.contrast || 0.18)) * 1.8, 0.86, 1.36));
    for (let index = 0; index < data.length; index += 4) {
      data[index] = enhancedChannel(data[index], brightnessShift, contrastScale);
      data[index + 1] = enhancedChannel(data[index + 1], brightnessShift, contrastScale);
      data[index + 2] = enhancedChannel(data[index + 2], brightnessShift, contrastScale);
    }
    context.putImageData(imageData, 0, 0);
    return {
      canvas: target,
      meta: {
        source: "manual_image_enhance",
        brightnessBefore: roundMetric(metrics.brightness || 0),
        contrastBefore: roundMetric(metrics.contrast || 0),
        brightnessShift: roundMetric(brightnessShift),
        contrastScale
      }
    };
  }

  function enhancedChannel(value, brightnessShift, contrastScale) {
    return Math.round(clamp(((value / 255 - 0.5) * contrastScale + 0.5 + brightnessShift) * 255, 0, 255));
  }

  function reanalyzePreprocessedSample(mode, sample, canvas, action, meta) {
    const clearedGeometryCorrections = Array.isArray(sample.geometryCorrections) ? sample.geometryCorrections.length : 0;
    const clearedCreaseGeometryEdits = Array.isArray(sample.creaseGeometryEdits) ? sample.creaseGeometryEdits.length : 0;
    const metrics = refreshSampleRecognition(mode, sample, canvas);
    const correction = {
      ...(meta || {}),
      source: meta && meta.source ? meta.source : `manual_${action}`,
      action,
      appliedAt: new Date().toISOString(),
      sampleId: sample.id,
      sampleName: sample.name,
      clearedGeometryCorrections,
      clearedCreaseGeometryEdits,
      qualityAfter: roundMetric(sample.quality || 0),
      subjectAreaAfter: roundMetric(metrics.subjectAreaRatio || 0),
      subjectCenterednessAfter: roundMetric(metrics.subjectCenteredness || 0)
    };
    sample.preprocessCorrections = [...(Array.isArray(sample.preprocessCorrections) ? sample.preprocessCorrections : []), correction].slice(-24);
    clearSampleGeometryAfterImageTransform(mode, sample);
    syncTransformedRouteRecord(mode, sample, metrics, canvas, `${preprocessActionLabel(action)}已应用`, "预处理");
    renderGeometryTrainingPanel();
    return sample;
  }

  function refreshSampleRecognition(mode, sample, canvas) {
    const metrics = analyzeImage(canvas, mode);
    const inputType = sample.userType === "auto" ? "auto" : sample.type || sample.userType || "auto";
    const modelInput = buildModelInput(mode, sample.name, inputType, metrics, sample.routeEvidence || null);
    const modelResult = normalizeHeuristicResult(modelInput, metrics);
    const resolvedType = inputType === "auto" ? modelResult.suggestedType : sample.type;
    applySampleWarnings(mode, resolvedType, metrics, sample.routeEvidence || null, modelResult);
    sample.type = resolvedType;
    sample.suggestedType = modelResult.suggestedType;
    sample.handOrientation = mode === "palm" ? metrics.handOrientation : null;
    sample.faceOrientation = mode === "face" ? metrics.faceOrientation : null;
    sample.metrics = metrics;
    sample.quality = metrics.quality;
    sample.warnings = modelResult.warnings;
    sample.overlayRegions = modelResult.overlayRegions;
    sample.modelInput = modelInput;
    sample.modelResult = modelResult;
    sample.modelVersion = recognitionAdapter.version;
    sample.label = sampleTypeLabel(mode, resolvedType);
    rebuildModelRegions(mode);
    return metrics;
  }

  function clearSampleGeometryAfterImageTransform(mode, sample) {
    invalidatePendingRecognitionImage(sample, "image_transform");
    sample.geometryCorrections = [];
    sample.creaseGeometryEdits = [];
    delete sample.originalModelGeometry;
    state.geometryCorrections[mode] = state.geometryCorrections[mode].filter((item) => item.sampleId !== sample.id);
    if (mode === "palm") {
      state.creaseReconnectSelection = [];
      state.creaseEditorNotice = "图片坐标系已变化，旧掌褶拆分和重连记录已清除。";
    }
    invalidateDerivedData();
  }

  function syncTransformedRouteRecord(mode, sample, metrics, canvas, reasonText, reasonPrefix) {
    const route = state.universalRoutes.find((item) => item.sampleId === sample.id);
    if (!route) return;
    route.sampleType = sample.type;
    route.imageDataUrl = canvasToDataUrl(canvas);
    route.rotation = sample.rotation;
    route.rotationCorrections = sample.rotationCorrections;
    route.preprocessCorrections = sample.preprocessCorrections;
    if (mode === "palm") route.palmMetrics = metrics;
    else route.faceMetrics = metrics;
    const reasons = Array.isArray(route.reasons) ? route.reasons : [];
    route.reasons = [
      ...reasons.filter((reason) => !reason.startsWith(reasonPrefix)),
      reasonText
    ];
    renderUniversalRoutes();
  }

  function normalizeRotationDegrees(degrees) {
    const total = normalizeTotalRotation(degrees);
    return total === 270 ? -90 : total;
  }

  function normalizeTotalRotation(degrees) {
    const rounded = Math.round(Number(degrees || 0) / 90) * 90;
    return ((rounded % 360) + 360) % 360;
  }

  function rotationDeltaLabel(degrees) {
    if (degrees === -90) return "左转90°";
    if (degrees === 90) return "右转90°";
    if (Math.abs(degrees) === 180) return "旋转180°";
    return `旋转${rotationDegreesLabel(degrees)}`;
  }

  function rotationDegreesLabel(degrees) {
    return `${normalizeTotalRotation(degrees)}°`;
  }

  function preprocessActionLabel(action) {
    if (action === "auto_prepare") return "一键优化";
    if (action === "auto_rescue") return "低质自动优化";
    if (action === "fit_subject") return "主体裁切";
    if (action === "enhance") return "自动增强";
    return "预处理";
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function drawOverlayLabel(context, width, mode, type, metrics) {
    const text = `${mode === "palm" ? "手相" : "面相"}｜${sampleTypeLabel(mode, type)}｜置信 ${percent(metrics.quality)}`;
    context.save();
    context.fillStyle = "rgba(30, 37, 40, 0.74)";
    context.fillRect(10, 10, Math.min(width - 20, context.measureText(text).width + 18), 30);
    context.fillStyle = "#fff";
    context.fillText(text, 19, 16);
    context.restore();
  }

  function overlayRegions(mode, type) {
    if (mode === "palm") return palmOverlayRegions(type);
    return faceOverlayRegions(type);
  }

  function palmOverlayRegions(type) {
    if (type === "palm_side") {
      return [{ kind: "rect", x: 0.55, y: 0.18, w: 0.33, h: 0.32, label: "婚姻线侧边", color: "rgba(167, 130, 42, 0.95)", fill: "rgba(167, 130, 42, 0.12)" }];
    }
    if (type === "nails") {
      return [{ kind: "rect", x: 0.18, y: 0.04, w: 0.64, h: 0.34, label: "指甲气色", color: "rgba(42, 95, 155, 0.95)", fill: "rgba(42, 95, 155, 0.12)" }];
    }
    if (type === "thumb") {
      return [{ kind: "rect", x: 0.02, y: 0.28, w: 0.36, h: 0.46, label: "拇指/虎口", color: "rgba(167, 130, 42, 0.95)", fill: "rgba(167, 130, 42, 0.12)" }];
    }
    if (type === "palm_back") {
      return [{ kind: "rect", x: 0.18, y: 0.16, w: 0.64, h: 0.7, label: "手背骨肉", color: "rgba(27, 107, 98, 0.95)", fill: "rgba(27, 107, 98, 0.1)" }];
    }
    return [
      { kind: "arc", cx: 0.31, cy: 0.6, rx: 0.2, ry: 0.32, start: -1.25, end: 1.65, label: "生命线", color: "rgba(27, 107, 98, 0.95)" },
      { kind: "line", x1: 0.22, y1: 0.48, x2: 0.75, y2: 0.42, label: "智慧线", color: "rgba(42, 95, 155, 0.95)" },
      { kind: "line", x1: 0.26, y1: 0.32, x2: 0.78, y2: 0.29, label: "感情线", color: "rgba(155, 63, 57, 0.9)" },
      { kind: "line", x1: 0.5, y1: 0.78, x2: 0.52, y2: 0.3, label: "命运线", color: "rgba(167, 130, 42, 0.95)" },
      { kind: "rect", x: 0.58, y: 0.22, w: 0.18, h: 0.38, label: "太阳/财运区", color: "rgba(167, 130, 42, 0.9)", fill: "rgba(167, 130, 42, 0.08)" }
    ];
  }

  function faceOverlayRegions(type) {
    if (type === "face_side") {
      return [{ kind: "rect", x: 0.18, y: 0.16, w: 0.58, h: 0.72, label: "侧面骨相", color: "rgba(167, 130, 42, 0.95)", fill: "rgba(167, 130, 42, 0.12)" }];
    }
    if (type === "eyes") {
      return [{ kind: "rect", x: 0.18, y: 0.28, w: 0.64, h: 0.2, label: "眉眼神", color: "rgba(42, 95, 155, 0.95)", fill: "rgba(42, 95, 155, 0.12)" }];
    }
    if (type === "nose") {
      return [{ kind: "rect", x: 0.35, y: 0.38, w: 0.3, h: 0.28, label: "鼻部财帛", color: "rgba(167, 130, 42, 0.95)", fill: "rgba(167, 130, 42, 0.12)" }];
    }
    if (type === "mouth_jaw") {
      return [{ kind: "rect", x: 0.25, y: 0.62, w: 0.5, h: 0.25, label: "口相/下庭", color: "rgba(155, 63, 57, 0.9)", fill: "rgba(155, 63, 57, 0.1)" }];
    }
    if (type === "forehead") {
      return [{ kind: "rect", x: 0.22, y: 0.08, w: 0.56, h: 0.25, label: "额头/上庭", color: "rgba(27, 107, 98, 0.95)", fill: "rgba(27, 107, 98, 0.1)" }];
    }
    return [
      { kind: "rect", x: 0.2, y: 0.08, w: 0.6, h: 0.25, label: "上庭", color: "rgba(27, 107, 98, 0.95)", fill: "rgba(27, 107, 98, 0.08)" },
      { kind: "rect", x: 0.2, y: 0.33, w: 0.6, h: 0.3, label: "中庭", color: "rgba(42, 95, 155, 0.95)", fill: "rgba(42, 95, 155, 0.08)" },
      { kind: "rect", x: 0.2, y: 0.63, w: 0.6, h: 0.26, label: "下庭", color: "rgba(167, 130, 42, 0.95)", fill: "rgba(167, 130, 42, 0.1)" },
      { kind: "line", x1: 0.5, y1: 0.08, x2: 0.5, y2: 0.9, label: "中轴", color: "rgba(155, 63, 57, 0.85)" }
    ];
  }

  function qualityLabel(value) {
    if (value >= 0.68) return "高";
    if (value >= 0.45) return "中";
    return "低";
  }

  function skinLikelihood(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const sum = r + g + b + 1;
    const nr = r / sum;
    const ng = g / sum;
    const warmRgb = r > 65 && g > 35 && b > 18 && r >= g * 0.92 && r > b * 1.08 && chroma > 12;
    const normalized = nr > 0.34 && nr < 0.58 && ng > 0.25 && ng < 0.42;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const ycbcr = y > 45 && cb > 74 && cb < 142 && cr > 128 && cr < 188;
    return clamp((warmRgb ? 0.38 : 0) + (normalized ? 0.28 : 0) + (ycbcr ? 0.34 : 0), 0, 1);
  }

  function subjectFromSkin(width, height, skinPixels, totalPixels, minX, minY, maxX, maxY) {
    if (!skinPixels || skinPixels / Math.max(1, totalPixels) < 0.025) return null;
    const boxWidth = Math.max(1, maxX - minX);
    const boxHeight = Math.max(1, maxY - minY);
    const centerX = (minX + maxX) / 2 / width;
    const centerY = (minY + maxY) / 2 / height;
    const areaRatio = clamp((boxWidth * boxHeight) / (width * height), 0, 1);
    const centeredness = 1 - clamp(Math.hypot(centerX - 0.5, centerY - 0.5) * 1.8, 0, 1);
    return {
      box: {
        x: minX / width,
        y: minY / height,
        width: boxWidth / width,
        height: boxHeight / height
      },
      areaRatio,
      aspectRatio: boxWidth / boxHeight,
      centerX,
      centerY,
      centeredness
    };
  }

  function suggestSampleType(mode, metrics) {
    if (mode === "palm") return suggestPalmType(metrics);
    return suggestFaceType(metrics);
  }

  function suggestPalmType(metrics) {
    if (metrics.skinCoverage < 0.06) return "mixed";
    if (metrics.subject && metrics.subject.aspectRatio < 0.42) return "palm_side";
    if (metrics.subject && metrics.subject.aspectRatio > 1.65 && metrics.lineClarity < 0.32) return "thumb";
    if (metrics.textureBusy > 0.42 || metrics.lineClarity > 0.42 || metrics.diagonalRatio > 0.2) return "palm_front";
    if (metrics.edgeDensity < 0.18 && metrics.skinCoverage > 0.18) return "palm_back";
    return "mixed";
  }

  function suggestFaceType(metrics) {
    if (metrics.skinCoverage < 0.05) return "mixed";
    if (metrics.symmetry > 0.67 && metrics.subjectCenteredness > 0.45) return "face_front";
    if (metrics.symmetry > 0.52) return "face_three_quarter";
    if (metrics.subject && metrics.subject.aspectRatio < 0.68) return "face_side";
    if (metrics.subject && metrics.subject.centerY < 0.36) return "forehead";
    return "mixed";
  }

  function imageWarnings(metrics) {
    const warnings = [];
    if (metrics.brightness < 0.24) warnings.push("光线偏暗");
    if (metrics.brightness > 0.82) warnings.push("曝光偏亮");
    if (metrics.contrast < 0.1) warnings.push("对比不足");
    if (metrics.lineClarity < 0.2) warnings.push("线条不清");
    if (metrics.skinCoverage < 0.05) warnings.push("主体不明显");
    if (metrics.subjectAreaRatio > 0 && metrics.subjectAreaRatio < 0.12) warnings.push("拍得太远");
    if (metrics.subject && metrics.subject.centeredness < 0.35) warnings.push("主体偏边");
    return warnings.slice(0, 4);
  }

  function pixelGray(data, width, x, y) {
    const index = (Math.floor(y) * width + Math.floor(x)) * 4;
    return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  }

  function regionWeight(nx, ny, left, right, top, bottom) {
    if (nx < left || nx > right || ny < top || ny > bottom) return 0.25;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const distance = Math.hypot((nx - centerX) / (right - left), (ny - centerY) / (bottom - top));
    return clamp(1.2 - distance, 0.35, 1);
  }

  function applyPalmDetection() {
    clearAutoDetectedFeatures("palm-features");
  }

  function confirmedPalmLineKeys(samples) {
    return new Set(samples.flatMap((sample) => {
      const lines = sample.modelResult && Array.isArray(sample.modelResult.creasePolylines) ? sample.modelResult.creasePolylines : [];
      return lines.filter((line) => line.reviewStatus === "accepted").map(normalizeCreaseSemanticReview).filter((review) => {
        const spec = palmCreaseSemanticSpec(review.candidateKey);
        return review.status === "confirmed" && spec && spec.allowedTypes.includes(sample.type);
      }).map((review) => review.candidateKey);
    }));
  }

  function prefillPalmLineAnnotations(samples) {
    resetAutoAnnotations("palm-line-annotations");
    confirmedPalmLineKeys(samples).forEach((key) => {
      const input = $(`#palm-line-annotations [data-annotation="${key}"]`);
      if (!input || input.dataset.source === "manual") return;
      input.value = "clear";
      input.dataset.source = "manual_semantic_review";
    });
  }

  function applyFaceDetection() {
    clearAutoDetectedFeatures("face-features");
  }

  function prefillFaceZoneAnnotations() {
    resetAutoAnnotations("face-zone-annotations");
  }

  function resetAutoAnnotations(rootId) {
    $all(`#${rootId} [data-annotation]`).forEach((input) => {
      if (input.dataset.source !== "manual") {
        input.value = "unknown";
        delete input.dataset.auto;
        delete input.dataset.source;
      }
    });
  }

  function renderPalmMetrics() {
    const metrics = state.palmMetrics;
    if (!metrics) {
      setHtml($("#palm-metrics"), `<span>线纹 --</span><span>掌色 --</span><span>纹理 --</span><span>掌向 --</span><span>置信 --</span>`);
      return;
    }
    setHtml($("#palm-metrics"), `
      <span>照片线纹 ${percent(metrics.lineClarity)}</span>
      <span>照片色温 ${metrics.redness > 0.22 ? "偏红" : "平和"}</span>
      <span>照片纹理 ${percent(metrics.textureBusy)}</span>
      <span>掌向 ${handOrientationTag(metrics.handOrientation)}</span>
      <span>图像质量 ${percent(metrics.quality)}</span>
    `);
  }

  function renderFaceMetrics() {
    const metrics = state.faceMetrics;
    if (!metrics) {
      setHtml($("#face-metrics"), `<span>对称 --</span><span>气色 --</span><span>清晰 --</span><span>朝向 --</span><span>置信 --</span>`);
      return;
    }
    setHtml($("#face-metrics"), `
      <span>照片对称 ${percent(metrics.symmetry)}</span>
      <span>照片色温 ${metrics.warmth > 0.44 ? "偏暖" : "平和"}</span>
      <span>照片清晰 ${percent(metrics.lineClarity)}</span>
      <span>朝向 ${faceOrientationTag(metrics.faceOrientation)}</span>
      <span>图像质量 ${percent(metrics.quality)}</span>
    `);
  }

  function initPersonalProfile() {
    renderPersonalProfile();
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const openButton = event.target.closest("[data-personal-profile-open]");
      if (openButton) {
        openPersonalProfileMode(openButton.dataset.personalProfileOpen);
        return;
      }
      const saveButton = event.target.closest("[data-personal-profile-save]");
      if (saveButton) {
        const mode = saveButton.dataset.personalProfileSave;
        if (personalProfileModeIsActive(mode)) savePersonalMasterCase(mode);
        else openPersonalProfileMode(mode);
      }
    });
  }

  function personalMasterCaseId(mode) {
    return personalProfileSeed ? `${personalProfileSeed.id}:${mode}` : `personal-master:${mode}`;
  }

  function isPersonalMasterCase(item) {
    return Boolean(item && (
      personalProfileModes.some((mode) => item.id === personalMasterCaseId(mode))
      || item.personalMaster === true
      || item.payload && item.payload.personalProfile && item.payload.personalProfile.isMaster
    ));
  }

  function personalMasterCase(mode) {
    return state.caseLibrary.find((item) => item && item.id === personalMasterCaseId(mode)) || null;
  }

  function personalProfileModeIsActive(mode) {
    if (mode === "palm") return state.palmSamples.some((sample) => sample && sample.personalProfile === true);
    if (mode === "face") return state.faceSamples.some((sample) => sample && sample.personalProfile === true);
    if (mode !== "bazi" || !personalProfileSeed) return false;
    const birth = personalProfileSeed.birth;
    return $("#birth-datetime").value === birth.datetime
      && $("#birth-place").value.trim() === birth.place
      && $("#birth-gender").value === birth.gender;
  }

  function personalAnalysisTextLength(value) {
    if (typeof value === "string") return value.trim().length;
    if (Array.isArray(value)) return value.reduce((total, item) => total + personalAnalysisTextLength(item), 0);
    if (!value || typeof value !== "object") return 0;
    return Object.values(value).reduce((total, item) => total + personalAnalysisTextLength(item), 0);
  }

  function personalAnnualTextLength(item) {
    if (!item) return 0;
    return personalAnalysisTextLength({
      overview: item.overview,
      domains: item.domains,
      synthesis: item.synthesis,
      keyPeriods: item.keyPeriods,
      caution: item.caution,
      actions: item.actions,
      basis: item.basis
    });
  }

  function personalAnnualDetailAudit(timeline) {
    const entries = Array.isArray(timeline) ? timeline : [];
    const lengths = entries.map(personalAnnualTextLength).filter((length) => length > 0);
    const signatures = entries.map((item) => JSON.stringify({ overview: item.overview, domains: item.domains, periods: item.keyPeriods, caution: item.caution, synthesis: item.synthesis }));
    return {
      yearCount: entries.length,
      fieldsPerYear: 10,
      domainCountPerYear: 4,
      actionCountPerYear: 3,
      minimumCharactersPerYear: lengths.length ? Math.min(...lengths) : 0,
      averageCharactersPerYear: lengths.length ? Math.round(lengths.reduce((total, length) => total + length, 0) / lengths.length) : 0,
      maximumCharactersPerYear: lengths.length ? Math.max(...lengths) : 0,
      uniqueNarrativeCount: new Set(signatures).size,
      adjacentDuplicateCount: signatures.slice(1).filter((item, index) => item === signatures[index]).length,
      combinedEvidenceYearCount: entries.filter((item) => {
        const synthesis = String(item.synthesis || "");
        return new RegExp(String(item.year)).test(synthesis)
          && /掌照|手相|掌纹|手掌|两掌/.test(synthesis)
          && /面照|面相|面部|脸部|脸型|下巴|下颏|下庭|唇形|唇带|眉眼|口唇/.test(synthesis)
          && /不能|不从|不把|不借|只借|不使用|不替|不解释|不由|无权|没有.{0,8}权限|止于|只说明|只属于|看不出当年|有没有对应变化|要看当时发生|照片时点|拍摄时点|拍摄当下|时点晚于|当前外观|成年基线|当年材料|当年经历|当年情况|当时材料|同期材料|同期资料|同期记录|童年档案|旧档案|另查|另列为待查|回到现实|现实复盘|现实记录|照片负责外观|单独记录|分开|分别交给|分成两类证据|各按实际材料|独立核对|保持未知|实际记录为准/.test(synthesis);
      }).length
    };
  }

  function personalPalmAnalysis(payload) {
    const annualDetail = personalAnnualDetailAudit(payload.timeline);
    return personalPalmRuntime.build(payload, personalProfileSeed, annualDetail);
  }

  function personalFaceAnalysis(payload) {
    return personalFaceRuntime.build(payload, personalProfileSeed, faceProportionThresholds);
  }

  function personalBaziAnalysis(payload) {
    const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
    const annualDetail = personalAnnualDetailAudit(timeline);
    const registeredPersonalYears = Array.isArray(window.PalmFacePersonalBaziAnnual?.years)
      ? window.PalmFacePersonalBaziAnnual.years
      : [];
    const personalEssayYears = new Set([
      ...Array.from({ length: 12 }, (_, index) => 2025 + index),
      ...registeredPersonalYears
    ]);
    const timelineYears = timeline.map((item) => Number(item.year)).filter(Number.isInteger);
    const customYears = timelineYears.filter((year) => personalEssayYears.has(year));
    const structuredYears = timelineYears.filter((year) => !personalEssayYears.has(year));
    const coverageSpans = (years) => years.reduce((spans, year) => {
      const current = spans[spans.length - 1];
      if (current && year === current.endYear + 1) {
        current.endYear = year;
        current.yearCount += 1;
      } else {
        spans.push({ startYear: year, endYear: year, yearCount: 1 });
      }
      return spans;
    }, []);
    const customSpans = coverageSpans(customYears);
    const structuredSpans = coverageSpans(structuredYears);
    const spanLabel = (spans) => spans
      .map((span) => span.startYear === span.endYear ? String(span.startYear) : `${span.startYear}-${span.endYear}`)
      .join("、");
    const customAnnualCoverage = {
      startYear: customYears[0] || null,
      endYear: customYears[customYears.length - 1] || null,
      yearCount: customYears.length,
      spans: customSpans,
      rangeLabel: spanLabel(customSpans),
      structuredStartYear: structuredYears[0] || null,
      structuredEndYear: structuredYears[structuredYears.length - 1] || null,
      structuredYearCount: structuredYears.length,
      structuredSpans,
      structuredRangeLabel: spanLabel(structuredSpans)
    };
    const customCoverageText = customYears.length
      ? `${customAnnualCoverage.rangeLabel} 共 ${customAnnualCoverage.yearCount} 年已经逐年重写为本人专稿：每年单独核对十神、流年干支、原局关系、大运开收与换运；三法段仅引用掌照长期观察与面照证据边界。`
      : "";
    const structuredCoverageText = structuredYears.length
      ? `${customAnnualCoverage.structuredRangeLabel} 共 ${customAnnualCoverage.structuredYearCount} 年目前仍是逐年结构化证据正文，能读年份关系和四个生活领域，但还没有逐年补入本人真实经历核验，所以不会标成“本人专稿”。`
      : "";
    const pillars = payload.pillars || {};
    const chartContext = payload.chartContext || {};
    const currentYear = new Date().getFullYear();
    const nearTerm = timeline.filter((item) => item.year >= currentYear && item.year <= currentYear + 9);
    const focusCounts = nearTerm.reduce((counts, item) => {
      const key = Object.keys(item.domains || {}).find((domain) => annualDomainLabel(domain) === item.focus) || "other";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const nearTermThreads = nearTerm.length
      ? nearTerm.map((item) => {
          const firstSentence = String(item.overview || item.theme || "").split("。")[0];
          return `${item.year}${item.yearPillar ? ` ${item.yearPillar}` : ""}：${firstSentence.replace(/^\d+岁这一年，/, "")}`;
        }).join("；")
      : "逐年资料待生成";
    const crossAnalysis = personalCrossRuntime.build(payload, personalProfileSeed);
    return {
      version: 2,
      mode: "bazi",
      title: "本人八字与三法合看详析",
      summary: `出生资料由当前使用者填写。四柱为 ${pillars.year || "待复核"}、${pillars.month || "待复核"}、${pillars.day || "待复核"}、${pillars.hour || "待复核"}；${pillars.exact ? "由 lunar-javascript 1.7.7 按节气交接时刻本地计算" : "当前仍是近似盘"}。${chartContext.luckStart ? `约 ${chartContext.luckStart.solar} 起运。` : "起运时间待复核。"}${crossAnalysis.summary ? ` ${crossAnalysis.summary}` : ""}`,
      sections: [
        {
          key: "birth_basis",
          title: "出生资料与排盘层级",
          text: `出生时间、地点和性别只按当前表单输入计算，不写入公开页面的固定主档。当前年、月、日、时四柱由开源历法库按节气交接时刻计算；历法计算补齐排盘不等于命理结论得到科学证实，格局、喜忌和事件仍只作传统参考。`
        },
        {
          key: "known_pillars",
          title: "当前可用命盘信息",
          text: `年柱 ${pillars.year || "待复核"}、月柱 ${pillars.month || "待复核"}、日柱 ${pillars.day || "待复核"}、时柱 ${pillars.hour || "待复核"}。逐年层把日主十神、天干五合、地支重复与合冲刑害破、三合三会、当前大运和换运年份分开读取；${chartContext.luckStart ? `起运约为 ${chartContext.luckStart.solar}` : "起运时间待复核"}。判断次序依次为月令与原局、大运、当年干支和现实记录。`
        },
        {
          key: "annual_depth",
          title: `${annualDetail.yearCount}年逐年详情`,
          text: `${customCoverageText}${structuredCoverageText}共取得 ${annualDetail.uniqueNarrativeCount} 份不同年度正文，相邻整卡重复 ${annualDetail.adjacentDuplicateCount} 次；其中 ${annualDetail.combinedEvidenceYearCount} 年都把当年八字时序、掌照长期观察和面照证据边界写入三法段。`
        },
        {
          key: "near_term",
          title: `${currentYear}-${currentYear + 9}逐年节点索引`,
          text: `${nearTermThreads}。索引只列年度差异；对应年度正文另列事业、钱、关系、身体、关键月份和行动次序，不用一个分数替代整年分析。`
        },
        {
          key: "decision_use",
          title: "事业、财运与感情的判断口径",
          text: "事业看可验证成果、职责和平台，财运看现金流、合同和风险，感情看沟通、责任和长期适配。流年只负责提醒何时更该推进、积累或守边界，不替代现实证据，也不保证升职、发财、结婚或分手。"
        },
        {
          key: "health_lifespan",
          title: "健康与寿命",
          text: "健康部分只提供作息、运动、体检和就医提醒；八字、手相和面相都不能可靠计算寿命，也不判断死亡时间。时间线延伸到100岁是为了覆盖长期规划，不表示寿命上限。"
        },
        ...(Array.isArray(crossAnalysis.sections) ? crossAnalysis.sections : [])
      ],
      annualDetail,
      customAnnualCoverage,
      chartContext,
      crossMethodStandards: crossAnalysis.standards || {},
      currentDecade: { startYear: currentYear, endYear: currentYear + 9, focusCounts },
      sourceRefs: Array.from(new Set(["web.lunar-javascript#eight-char", "web.lunar-javascript#exact-ganzhi", "local.suminfeng-bazi#annual-monthly", "local.xuweigang-cases#method", ...(crossAnalysis.sourceRefs || [])])),
      boundaries: Array.from(new Set(["calendar_engine_is_not_scientific_validation_of_fortune_telling", "palm_and_face_are_long_term_baselines_not_year_timers", "traditional_reference_only", "rule_sources_are_tiered", "no_death_year_prediction", ...(crossAnalysis.boundaries || [])]))
    };
  }

  function buildPersonalAnalysis(mode, payload) {
    if (!personalProfileSeed || !payload) return null;
    if (mode === "palm") return personalPalmAnalysis(payload);
    if (mode === "face") return personalFaceAnalysis(payload);
    if (mode === "bazi") return personalBaziAnalysis(payload);
    return null;
  }

  function personalAnalysisBlock(analysis) {
    if (!analysis || !Array.isArray(analysis.sections)) return "";
    const annual = analysis.annualDetail;
    const customAnnual = analysis.customAnnualCoverage;
    const customAnnualAudit = customAnnual && customAnnual.yearCount
      ? ` · 本人专稿 ${customAnnual.yearCount} 年（${customAnnual.rangeLabel || `${customAnnual.startYear}-${customAnnual.endYear}`}）${customAnnual.structuredYearCount ? ` · 历史结构化 ${customAnnual.structuredYearCount} 年（${customAnnual.structuredRangeLabel || `${customAnnual.structuredStartYear}-${customAnnual.structuredEndYear}`}）` : ""}`
      : "";
    return `
      <section class="report-card personal-analysis-report">
        <div class="personal-analysis-head">
          <div>
            <p class="eyebrow">本人最高详情</p>
            <h3>${escapeHtml(analysis.title)}</h3>
          </div>
          <span class="pill strong">${analysis.sections.length}项专属分析</span>
        </div>
        <p class="personal-analysis-summary">${escapeHtml(analysis.summary)}</p>
        <div class="personal-analysis-sections">
          ${analysis.sections.map((section) => `
            <section class="personal-analysis-section">
              <h4>${escapeHtml(section.title)}</h4>
              <p>${escapeHtml(section.text)}</p>
            </section>
          `).join("")}
        </div>
        ${annual && annual.yearCount ? `<p class="muted personal-analysis-audit">逐年覆盖 ${annual.yearCount} 年${customAnnualAudit} · 每年4个领域 · 每年3条行动 · 单年最少 ${annual.minimumCharactersPerYear} 字</p>` : ""}
      </section>
    `;
  }

  function personalHistoryDepthText(payload) {
    const analysis = payload && payload.personalAnalysis;
    if (!analysis) return "本人专属详情打开后生成";
    const sectionCount = Array.isArray(analysis.sections) ? analysis.sections.length : 0;
    if (payload.type === "bazi") {
      const annual = analysis.annualDetail || {};
      const customAnnual = analysis.customAnnualCoverage || {};
      const storedCustomYearCount = Number.isInteger(customAnnual.yearCount) ? customAnnual.yearCount : 0;
      const customYearCount = annual.yearCount === 101 ? Math.max(storedCustomYearCount, 101) : storedCustomYearCount;
      return `${sectionCount}项专属分析 · ${annual.yearCount || 0}年 / 本人专稿${customYearCount}年 · 单年最少${annual.minimumCharactersPerYear || 0}字`;
    }
    const evidence = Array.isArray(analysis.evidence) ? analysis.evidence : [];
    return `${sectionCount}项专属分析 · ${evidence.length}张本人证据图 · ${personalAnalysisTextLength(analysis)}字结构化说明`;
  }

  function safePersonalAssetUrl(value) {
    const text = typeof value === "string" ? value : "";
    return /^\.\/assets\/personal\/[A-Za-z0-9_.-]+\.jpg$/.test(text) ? text : "";
  }

  function personalProfileAssetStrip(mode) {
    const data = state.personalProfileData;
    const samples = mode === "palm" ? data && data.palmSamples : mode === "face" ? data && data.faceSamples : [];
    if (!Array.isArray(samples) || !samples.length) return "";
    return `
      <div class="personal-profile-thumbnails">
        ${samples.map((sample) => {
          const source = safePersonalAssetUrl(sample.personalAssetUrl);
          return source ? `<img src="${source}" alt="${escapeHtml(sample.label || sample.name || "本人样本")}" loading="lazy" decoding="async">` : "";
        }).join("")}
      </div>
    `;
  }

  function renderPersonalProfile() {
    const target = $("#personal-profile-modes");
    if (!target || !personalProfileSeed) return;
    const birth = personalProfileSeed.birth;
    const birthNode = $("#personal-profile-birth");
    if (birthNode) birthNode.textContent = `${birth.datetime.replace("T", " ")} · ${birth.place} · ${birth.gender === "male" ? "男" : "女"}`;
    const pinnedModes = personalProfileModes.filter((mode) => personalMasterCase(mode));
    const detailedModes = personalProfileModes.filter((mode) => {
      const item = personalMasterCase(mode);
      return item && item.payload && item.payload.detailLevel === "maximum";
    });
    const status = $("#personal-profile-status");
    if (status) {
      status.textContent = state.personalProfileBusyMode
        ? `正在载入${state.personalProfileBusyMode === "palm" ? "手相" : state.personalProfileBusyMode === "face" ? "面相" : "八字"}`
        : `固定置顶 ${pinnedModes.length}/3 · 完整快照 ${detailedModes.length}/3`;
    }
    const modeLabels = { palm: "手相", face: "面相", bazi: "八字" };
    setHtml(target, personalProfileModes.map((mode) => {
      const spec = personalProfileSeed.modes[mode];
      const item = personalMasterCase(mode);
      const detailed = Boolean(item && item.payload && item.payload.detailLevel === "maximum");
      const updatedAt = item && (item.updatedAt || item.createdAt);
      return `
        <div class="personal-profile-mode">
          <div class="personal-profile-mode-copy">
            <div class="personal-profile-mode-head">
              <strong>${escapeHtml(spec.title)}</strong>
              <span class="tag ${detailed ? "green" : "gold"}">${detailed ? "完整快照" : item ? "详情按需" : "待写入"}</span>
            </div>
            <p>${escapeHtml(spec.verifiedSummary)}</p>
            ${updatedAt ? `<div class="case-meta">最近更新 ${formatIsoTime(updatedAt)}</div>` : ""}
            ${personalProfileAssetStrip(mode)}
          </div>
          <div class="personal-profile-actions">
            <button class="secondary-action compact-action" type="button" data-personal-profile-open="${mode}">打开${modeLabels[mode]}</button>
            <button class="secondary-action compact-action" type="button" data-personal-profile-save="${mode}">更新主档案</button>
          </div>
        </div>
      `;
    }).join(""));
  }

  async function loadPersonalProfileData() {
    if (state.personalProfileData) return state.personalProfileData;
    if (state.personalProfileDataPromise) return state.personalProfileDataPromise;
    if (!personalProfileSeed) throw new Error("personal_profile_seed_missing");
    const task = fetch(personalProfileSeed.dataUrl, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`personal_profile_data_${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!data || data.profileId !== personalProfileSeed.id || !Array.isArray(data.palmSamples) || !Array.isArray(data.faceSamples)) {
          throw new Error("personal_profile_data_invalid");
        }
        state.personalProfileData = data;
        return data;
      });
    state.personalProfileDataPromise = task;
    return task.finally(() => {
      if (state.personalProfileDataPromise === task) state.personalProfileDataPromise = null;
    });
  }

  function normalizePersonalProfileSample(sample, mode) {
    const source = deepClone(sample || {});
    const modelResult = normalizeImportedModelResult({ ...(source.modelResult || {}), mode });
    return {
      ...source,
      id: source.id || `personal-${mode}-${Date.now()}`,
      name: source.name || `${mode}-sample`,
      type: source.type || (mode === "palm" ? "palm_front" : "face_front"),
      userType: "verified_personal_fixture",
      suggestedType: source.suggestedType || source.type,
      label: source.label || sampleTypeLabel(mode, source.type),
      quality: Number(source.quality || source.metrics && source.metrics.quality || 0.8),
      warnings: Array.isArray(source.warnings) ? source.warnings : [],
      overlayRegions: Array.isArray(source.overlayRegions) ? source.overlayRegions : [],
      personalAssetUrl: safePersonalAssetUrl(source.personalAssetUrl),
      modelVersion: modelResult ? modelResult.modelVersion : source.modelVersion,
      modelResult,
      imageDecode: normalizeImageDecodeAudit(source.imageDecode),
      recognitionRevision: sampleRecognitionRevision(source),
      recognitionResultAudit: source.recognitionResultAudit && typeof source.recognitionResultAudit === "object"
        ? source.recognitionResultAudit
        : null,
      recognitionResultHistory: Array.isArray(source.recognitionResultHistory)
        ? source.recognitionResultHistory.slice(-12)
        : [],
      geometryCorrections: Array.isArray(source.geometryCorrections) ? source.geometryCorrections : [],
      creaseGeometryEdits: Array.isArray(source.creaseGeometryEdits) ? source.creaseGeometryEdits : [],
      handOrientation: modelResult && modelResult.handOrientation || source.handOrientation || null,
      faceOrientation: modelResult && modelResult.faceOrientation || source.faceOrientation || null,
      metrics: source.metrics && typeof source.metrics === "object" ? source.metrics : { quality: Number(source.quality || 0.8) },
      sampleProvenance: normalizeSampleProvenance({
        ...(source.sampleProvenance || {}),
        subjectKey: personalProfileSeed && personalProfileSeed.id || "personal-master",
        sourceType: "self_owned",
        personalProfile: true
      }),
      personalProfile: true
    };
  }

  function mergePersonalProfileSampleHistory(sample, savedSample) {
    if (!sample || !savedSample) return sample;
    const merged = {
      ...sample,
      geometryCorrections: Array.isArray(savedSample.geometryCorrections)
        ? deepClone(savedSample.geometryCorrections)
        : sample.geometryCorrections,
      creaseGeometryEdits: Array.isArray(savedSample.creaseGeometryEdits)
        ? deepClone(savedSample.creaseGeometryEdits)
        : sample.creaseGeometryEdits,
      subjectSelection: savedSample.subjectSelection && typeof savedSample.subjectSelection === "object"
        ? deepClone(savedSample.subjectSelection)
        : (sample.subjectSelection || null),
      subjectSelectionHistory: Array.isArray(savedSample.subjectSelectionHistory)
        ? deepClone(savedSample.subjectSelectionHistory).slice(-12)
        : (Array.isArray(sample.subjectSelectionHistory) ? sample.subjectSelectionHistory : []),
      recognitionCache: savedSample.recognitionCache && typeof savedSample.recognitionCache === "object"
        ? deepClone(savedSample.recognitionCache)
        : (sample.recognitionCache || null),
      recognitionRevision: Math.max(sampleRecognitionRevision(sample), sampleRecognitionRevision(savedSample)),
      recognitionResultAudit: savedSample.recognitionResultAudit && typeof savedSample.recognitionResultAudit === "object"
        ? deepClone(savedSample.recognitionResultAudit)
        : (sample.recognitionResultAudit || null),
      recognitionResultHistory: Array.isArray(savedSample.recognitionResultHistory)
        ? deepClone(savedSample.recognitionResultHistory).slice(-12)
        : (Array.isArray(sample.recognitionResultHistory) ? sample.recognitionResultHistory.slice(-12) : []),
      imageDecode: normalizeImageDecodeAudit(savedSample.imageDecode || sample.imageDecode),
      sampleProvenance: normalizeSampleProvenance({
        ...(savedSample.sampleProvenance || sample.sampleProvenance || {}),
        subjectKey: personalProfileSeed && personalProfileSeed.id || "personal-master",
        sourceType: "self_owned",
        personalProfile: true
      }),
      historicalTransforms: {
        rotation: normalizeTotalRotation(savedSample.rotation || 0),
        rotationCorrections: deepClone(savedSample.rotationCorrections || []),
        preprocessCorrections: deepClone(savedSample.preprocessCorrections || [])
      }
    };
    if (!merged.modelResult) return merged;
    if (!merged.originalModelGeometry) {
      merged.originalModelGeometry = {
        keypoints: deepClone(merged.modelResult.keypoints || []),
        lineSegments: deepClone(merged.modelResult.lineSegments || []),
        creasePolylines: deepClone(merged.modelResult.creasePolylines || [])
      };
    }
    const coordinateCompatible = merged.historicalTransforms.rotation === 0
      && !merged.historicalTransforms.preprocessCorrections.some((item) => item && ["manual_subject_crop", "manual_subject_candidate_crop", "auto_image_prepare", "auto_quality_rescue"].includes(item.source));
    if (!coordinateCompatible) {
      merged.geometryCorrections = [];
      merged.creaseGeometryEdits = merged.creaseGeometryEdits.map((edit) => ({ ...edit, replayStatus: "coordinate_incompatible" }));
      if (merged.subjectSelection) {
        merged.subjectSelection = {
          ...merged.subjectSelection,
          replayStatus: "audit_preserved_transform_not_replayed"
        };
      }
      return merged;
    }
    const savedResult = savedSample.modelResult || {};
    const sameModelVersion = savedSample.modelVersion === merged.modelVersion;
    if (merged.creaseGeometryEdits.length && !sameModelVersion) {
      merged.creaseGeometryEdits = merged.creaseGeometryEdits.map((edit) => ({ ...edit, replayStatus: "model_version_mismatch" }));
    }
    if (merged.creaseGeometryEdits.length && sameModelVersion && Array.isArray(savedResult.creasePolylines)) {
      merged.modelResult.creasePolylines = deepClone(savedResult.creasePolylines);
    }
    if (sameModelVersion && Array.isArray(savedResult.faceObservationCandidates)) {
      merged.modelResult.faceObservationCandidates = faceObservationRuntime.preserve(
        savedResult.faceObservationCandidates,
        merged.modelResult.faceObservationCandidates
      );
    }
    const savedPolylines = new Map((savedResult.creasePolylines || []).map((item) => [item.key, item]));
    merged.modelResult.creasePolylines = (merged.modelResult.creasePolylines || []).map((item) => {
      const saved = savedPolylines.get(item.key);
      if (!saved || !["accepted", "rejected"].includes(saved.reviewStatus)) return item;
      const manualPoints = saved.reviewSource === "manual_control_point" && Array.isArray(saved.points)
        ? deepClone(saved.points)
        : item.points;
      const semanticReview = normalizeCreaseSemanticReview(saved);
      const semanticConfirmed = saved.reviewStatus === "accepted" && semanticReview.status === "confirmed";
      return {
        ...item,
        points: manualPoints,
        reviewStatus: saved.reviewStatus,
        reviewSource: saved.reviewSource || "manual_geometry_review",
        reviewedAt: saved.reviewedAt || null,
        geometrySource: saved.geometrySource || item.geometrySource,
        semanticKey: semanticConfirmed ? semanticReview.candidateKey : null,
        semanticStatus: semanticConfirmed ? "manual_confirmed" : semanticReview.status,
        semanticReview: semanticReview.status === "unclassified" ? null : semanticReview,
        namingAllowed: semanticConfirmed
      };
    });
    (merged.geometryCorrections || []).forEach((correction) => {
      if (!faceThirdsRuntime.replayable(correction)) return;
      const after = normalizeGeometryPoint(correction.after);
      if (!after) return;
      if (correction.targetKind === "keypoint") {
        const point = (merged.modelResult.keypoints || []).find((item) => item.key === correction.targetKey);
        if (point) {
          Object.assign(point, after, {
            confidence: Math.max(Number(point.confidence || 0), 0.92),
            source: faceThirdsRuntime.replaySource(correction)
          });
        }
        return;
      }
      if (correction.targetKind === "segment") {
        const segment = (merged.modelResult.lineSegments || []).find((item) => item.key === correction.targetKey);
        if (!segment) return;
        if (correction.endpoint === "start") Object.assign(segment, { x1: after.x, y1: after.y, source: "manual_geometry" });
        else Object.assign(segment, { x2: after.x, y2: after.y, source: "manual_geometry" });
        return;
      }
      if (correction.targetKind === "polyline") {
        const polyline = (merged.modelResult.creasePolylines || []).find((item) => item.key === correction.targetKey);
        const pointIndex = Number.isInteger(correction.pointIndex)
          ? correction.pointIndex
          : Number(String(correction.endpoint || "").replace("point_", ""));
        if (polyline && Array.isArray(polyline.points) && polyline.points[pointIndex]) {
          polyline.points[pointIndex] = after;
          polyline.reviewStatus = "accepted";
          polyline.reviewSource = "manual_control_point";
          polyline.geometrySource = "manual_control_point";
        }
      }
    });
    return merged;
  }

  function restorePersonalProfileAnnotations(mode, payload) {
    const rootId = mode === "palm" ? "palm-line-annotations" : "face-zone-annotations";
    const saved = mode === "palm" ? payload && payload.lineAnnotations : payload && payload.zoneAnnotations;
    $all(`#${rootId} [data-annotation]`).forEach((input) => {
      input.value = "unknown";
      delete input.dataset.auto;
      delete input.dataset.source;
    });
    (Array.isArray(saved) ? saved : []).forEach((item) => {
      const input = $(`#${rootId} [data-annotation="${item.key}"]`);
      if (!input || !Array.from(input.options).some((option) => option.value === item.status)) return;
      input.value = item.status;
      input.dataset.source = item.source || "manual";
      if (item.source === "auto_heuristic") input.dataset.auto = "true";
      if (item.source === "model_adapter") input.dataset.auto = "model";
    });
  }

  async function openPersonalProfileMode(mode) {
    if (!personalProfileModes.includes(mode) || state.personalProfileBusyMode) return false;
    state.personalProfileBusyMode = mode;
    renderPersonalProfile();
    try {
      await ensureFullCaseLibraryLoaded();
      if (mode === "bazi") {
        await ensureBaziRuntime();
        await loadPersonalProfileData();
        applyPersonalBirthInputs();
        const existing = personalMasterCase("bazi");
        const savedDayPillar = existing && existing.payload && existing.payload.pillars && existing.payload.pillars.day;
        $("#day-pillar").value = requireBaziRuntime().isValidDayPillar(savedDayPillar) ? savedDayPillar : "";
        activateMode("bazi");
        renderBaziReport();
      } else {
        const data = await loadPersonalProfileData();
        const sourceSamples = mode === "palm" ? data.palmSamples : data.faceSamples;
        const existingPayload = personalMasterCase(mode) && personalMasterCase(mode).payload;
        const savedSamples = existingPayload && Array.isArray(existingPayload.samples) ? existingPayload.samples : [];
        const samples = sourceSamples.map((sample) => {
          const normalized = normalizePersonalProfileSample(sample, mode);
          const saved = savedSamples.find((item) => item && item.name === normalized.name);
          return mergePersonalProfileSampleHistory(normalized, saved);
        }).filter((sample) => sample.modelResult);
        if (!samples.length) throw new Error(`personal_${mode}_samples_missing`);
        activateMode(mode);
        restorePersonalProfileAnnotations(mode, existingPayload);
        if (mode === "palm") {
          state.palmSamples = samples;
          rebuildModelRegions("palm");
          state.geometryCorrections.palm = samples.flatMap((sample) => sample.geometryCorrections || []);
          state.palmMetrics = aggregateMetrics(samples);
          applyPalmDetection(modeAnalysisSamples(samples));
          prefillPalmLineAnnotations(samples);
          renderPalmMetrics();
          renderSampleList("palm");
          renderPalmReport();
        } else {
          state.faceSamples = samples;
          rebuildModelRegions("face");
          state.geometryCorrections.face = samples.flatMap((sample) => sample.geometryCorrections || []);
          state.faceMetrics = aggregateMetrics(samples);
          applyFaceDetection(modeAnalysisSamples(samples));
          prefillFaceZoneAnnotations();
          renderFaceMetrics();
          renderSampleList("face");
          renderFaceReport();
        }
        await renderPersonalProfilePreview(mode, samples[0]);
      }
      await savePersonalMasterCase(mode, { silent: true });
      return true;
    } catch (error) {
      const status = $("#personal-profile-status");
      if (status) status.textContent = `本人档案载入失败：${shortError(error)}`;
      return false;
    } finally {
      state.personalProfileBusyMode = "";
      renderPersonalProfile();
    }
  }

  function renderPersonalProfilePreview(mode, sample) {
    const source = safePersonalAssetUrl(sample && sample.personalAssetUrl);
    if (!source) return Promise.resolve(false);
    const canvas = $(mode === "palm" ? "#palm-canvas" : "#face-canvas");
    const empty = $(mode === "palm" ? "#palm-empty" : "#face-empty");
    if (!canvas) return Promise.resolve(false);
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        if (empty) empty.classList.add("hidden");
        if (mode === "palm") state.palmImage = context.getImageData(0, 0, canvas.width, canvas.height);
        else state.faceImage = context.getImageData(0, 0, canvas.width, canvas.height);
        setPreviewBaseCanvas(mode, canvas);
        redrawPreviewForSample(mode, sample, sample.modelResult);
        renderOverlaySummary(mode, sample);
        resolve(true);
      };
      image.onerror = () => resolve(false);
      image.src = source;
    });
  }

  function personalMasterPlaceholder(mode) {
    const spec = personalProfileSeed.modes[mode];
    const now = new Date().toISOString();
    const payload = {
      type: mode,
      createdAt: now,
      detailLevel: "maximum_lazy",
      detailPriority: "maximum",
      ownerLabel: personalProfileSeed.ownerLabel,
      sourceFiles: Array.from(spec.sourceFiles || []),
      verifiedSummary: spec.verifiedSummary,
      lazyDetail: {
        strategy: mode === "bazi" ? "generate_101_years_on_open" : "fetch_personal_profile_data_on_open",
        dataUrl: mode === "bazi" ? null : personalProfileSeed.dataUrl
      },
      personalProfile: {
        id: personalProfileSeed.id,
        mode,
        isMaster: true,
        fixedHistoryId: personalMasterCaseId(mode),
        version: personalProfileSeed.version
      },
      boundaries: Array.from(personalProfileSeed.boundaries || [])
    };
    if (mode === "bazi") {
      payload.birth = deepClone(personalProfileSeed.birth);
      payload.timelineRange = personalTimelineRange();
      payload.timeline = [];
    }
    return {
      id: personalMasterCaseId(mode),
      title: spec.title,
      mode,
      createdAt: now,
      updatedAt: null,
      feedback: normalizeFeedback(null),
      thumbnails: [],
      personalMaster: true,
      pinned: true,
      payload
    };
  }

  function sortCaseItems(items) {
    const masterOrder = new Map(personalProfileModes.map((mode, index) => [personalMasterCaseId(mode), index]));
    return (Array.isArray(items) ? items : [])
      .slice()
      .sort((a, b) => {
        const aOrder = masterOrder.has(String(a && a.id)) ? masterOrder.get(String(a.id)) : Number.POSITIVE_INFINITY;
        const bOrder = masterOrder.has(String(b && b.id)) ? masterOrder.get(String(b.id)) : Number.POSITIVE_INFINITY;
        if (aOrder !== bOrder) return aOrder - bOrder;
        if (aOrder !== Number.POSITIVE_INFINITY) return 0;
        return String(b && (b.updatedAt || b.createdAt) || "").localeCompare(String(a && (a.updatedAt || a.createdAt) || ""));
      });
  }

  function validPersonalMasterCase(item, mode) {
    const profile = item && item.payload && item.payload.personalProfile;
    return Boolean(
      item
      && item.id === personalMasterCaseId(mode)
      && profile
      && profile.id === personalProfileSeed.id
      && profile.mode === mode
      && profile.isMaster === true
      && (mode !== "bazi" || profile.version === personalProfileSeed.version)
    );
  }

  function upgradePersonalMasterPayload(mode, payload) {
    if (!payload || payload.detailLevel !== "maximum") return { payload, changed: false };
    const profile = payload.personalProfile || {};
    const expectedAnalysisVersion = mode === "palm" || mode === "face" ? 3 : 2;
    const analysisCurrent = payload.personalAnalysis && payload.personalAnalysis.version === expectedAnalysisVersion;
    const profileCurrent = profile.version === personalProfileSeed.version;
    if (analysisCurrent && profileCurrent && Number(payload.detailCoverage && payload.detailCoverage.personalAnalysisSectionCount) >= 6) {
      return { payload, changed: false };
    }
    const personalAnalysis = buildPersonalAnalysis(mode, payload);
    const detailCoverage = {
      ...(payload.detailCoverage || {}),
      personalAnalysisSectionCount: personalAnalysis && Array.isArray(personalAnalysis.sections) ? personalAnalysis.sections.length : 0,
      personalAnalysisCharacterCount: personalAnalysisTextLength(personalAnalysis),
      minimumAnnualCharacterCount: personalAnalysis && personalAnalysis.annualDetail
        ? personalAnalysis.annualDetail.minimumCharactersPerYear
        : 0
    };
    return {
      changed: true,
      payload: {
        ...payload,
        personalAnalysis,
        detailCoverage,
        personalProfile: { ...profile, version: personalProfileSeed.version }
      }
    };
  }

  async function ensurePersonalMasterCases(options = {}) {
    if (!personalProfileSeed || !state.caseLibraryFullyLoaded) return false;
    let changed = false;
    const byId = new Map(state.caseLibrary.map((item) => [String(item.id), item]));
    personalProfileModes.forEach((mode) => {
      const id = personalMasterCaseId(mode);
      const existing = byId.get(id);
      if (!validPersonalMasterCase(existing, mode)) {
        byId.set(id, personalMasterPlaceholder(mode));
        changed = true;
        return;
      }
      const upgraded = upgradePersonalMasterPayload(mode, existing.payload);
      if (existing.personalMaster !== true || existing.pinned !== true || existing.title !== personalProfileSeed.modes[mode].title || upgraded.changed) {
        byId.set(id, {
          ...existing,
          title: personalProfileSeed.modes[mode].title,
          personalMaster: true,
          pinned: true,
          payload: upgraded.payload
        });
        changed = true;
      }
    });
    if (!changed) return false;
    state.caseLibrary = sortCaseItems(Array.from(byId.values())).slice(0, caseLibraryMaxCases);
    state.caseLibraryTotalCount = state.caseLibrary.length;
    state.caseStorage = {
      ...state.caseStorage,
      caseCount: state.caseLibrary.length,
      loadedCaseCount: state.caseLibrary.length,
      fullyLoaded: true
    };
    invalidateDerivedData();
    renderCaseLibrary();
    renderPersonalProfile();
    if (options.persist !== false) await persistCaseLibrary();
    return true;
  }

  function schedulePersonalMasterSeed() {
    if (!personalProfileSeed || !state.caseLibraryFullyLoaded || state.personalMasterSeedScheduled || state.personalMasterSeedPromise) return;
    state.personalMasterSeedScheduled = true;
    const run = () => {
      state.personalMasterSeedScheduled = false;
      const task = ensurePersonalMasterCases({ persist: true });
      state.personalMasterSeedPromise = task;
      task.finally(() => {
        if (state.personalMasterSeedPromise === task) state.personalMasterSeedPromise = null;
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1200 });
      return;
    }
    window.setTimeout(run, 250);
  }

  function applyPersonalBirthInputs() {
    const birth = personalProfileSeed.birth;
    $("#birth-datetime").value = birth.datetime;
    $("#birth-place").value = birth.place;
    $("#birth-gender").value = birth.gender;
    $("#timeline-start-year").value = "2001";
    $("#timeline-end-year").value = "2101";
  }

  function personalTimelineRange() {
    return {
      birthYear: 2001,
      startYear: 2001,
      endYear: 2101,
      startAge: 0,
      endAge: 100,
      totalYears: 101,
      yearCount: 101
    };
  }

  function personalMasterPayload(mode) {
    let payload;
    if (mode === "palm") {
      const inputSnapshot = {
        datetime: $("#birth-datetime").value,
        place: $("#birth-place").value,
        gender: $("#birth-gender").value,
        startYear: $("#timeline-start-year").value,
        endYear: $("#timeline-end-year").value
      };
      applyPersonalBirthInputs();
      try {
        payload = palmExportPayload();
      } finally {
        $("#birth-datetime").value = inputSnapshot.datetime;
        $("#birth-place").value = inputSnapshot.place;
        $("#birth-gender").value = inputSnapshot.gender;
        $("#timeline-start-year").value = inputSnapshot.startYear;
        $("#timeline-end-year").value = inputSnapshot.endYear;
      }
    } else if (mode === "face") {
      payload = faceExportPayload();
    } else {
      applyPersonalBirthInputs();
      payload = baziExportPayload();
    }
    const spec = personalProfileSeed.modes[mode];
    if (mode === "palm") {
      payload.timelineRange = personalTimelineRange();
      payload.timeline = palmTimeline(payload.scores, payload.timelineRange);
    }
    const samples = Array.isArray(payload.samples) ? payload.samples : [];
    const detailCoverage = {
      sampleCount: samples.length,
      modelResultCount: samples.filter((sample) => sample && sample.modelResult).length,
      manualCorrectionCount: samples.reduce((total, sample) => total + (Array.isArray(sample.geometryCorrections) ? sample.geometryCorrections.length : 0), 0),
      creaseEditCount: samples.reduce((total, sample) => total + (Array.isArray(sample.creaseGeometryEdits) ? sample.creaseGeometryEdits.length : 0), 0),
      annotationCount: Array.isArray(payload.lineAnnotations)
        ? payload.lineAnnotations.length
        : Array.isArray(payload.zoneAnnotations)
          ? payload.zoneAnnotations.length
          : 0,
      annualYearCount: Array.isArray(payload.timeline) ? payload.timeline.length : 0
    };
    const basePayload = {
      ...payload,
      detailLevel: "maximum",
      detailPriority: personalProfileSeed.detailPriority,
      ownerLabel: personalProfileSeed.ownerLabel,
      subjectBirth: deepClone(personalProfileSeed.birth),
      sourceFiles: Array.from(spec.sourceFiles || []),
      verifiedSummary: spec.verifiedSummary,
      annualDetailCount: Array.isArray(payload.timeline) ? payload.timeline.length : 0,
      detailCoverage,
      personalProfile: {
        id: personalProfileSeed.id,
        mode,
        isMaster: true,
        fixedHistoryId: personalMasterCaseId(mode),
        ownerLabel: personalProfileSeed.ownerLabel,
        version: personalProfileSeed.version,
        updatePolicy: "fixed_id_replace_without_duplicates",
        comparisonPolicy: "ordinary_cases_are_reference_only"
      },
      boundaries: Array.from(new Set([...(payload.boundaries || []), ...(personalProfileSeed.boundaries || [])]))
    };
    const personalAnalysis = buildPersonalAnalysis(mode, basePayload);
    return {
      ...basePayload,
      personalAnalysis,
      detailCoverage: {
        ...detailCoverage,
        personalAnalysisSectionCount: personalAnalysis && Array.isArray(personalAnalysis.sections) ? personalAnalysis.sections.length : 0,
        personalAnalysisCharacterCount: personalAnalysisTextLength(personalAnalysis),
        minimumAnnualCharacterCount: personalAnalysis && personalAnalysis.annualDetail
          ? personalAnalysis.annualDetail.minimumCharactersPerYear
          : 0
      }
    };
  }

  async function savePersonalMasterCase(mode, options = {}) {
    if (!personalProfileModes.includes(mode) || !personalProfileSeed) return false;
    if (["palm", "face"].includes(mode) && !personalProfileModeIsActive(mode)) {
      return openPersonalProfileMode(mode);
    }
    state.caseSavePromise = state.caseSavePromise
      .catch(() => undefined)
      .then(() => savePersonalMasterCaseNow(mode, options));
    return state.caseSavePromise;
  }

  async function savePersonalMasterCaseNow(mode, options = {}) {
    if (mode === "bazi") await ensureBaziRuntime();
    if (mode === "palm" || mode === "face") await ensureTraditionalRules();
    if (mode === "bazi") applyPersonalBirthInputs();
    await ensureFullCaseLibraryLoaded();
    await ensurePersonalMasterCases({ persist: false });
    const payload = personalMasterPayload(mode);
    if (mode === "bazi" && (!Array.isArray(payload.timeline) || payload.timeline.length !== 101)) {
      throw new Error("personal_bazi_timeline_must_have_101_years");
    }
    const id = personalMasterCaseId(mode);
    const existing = personalMasterCase(mode);
    const now = new Date().toISOString();
    const item = {
      id,
      title: personalProfileSeed.modes[mode].title,
      mode,
      createdAt: existing && existing.createdAt ? existing.createdAt : now,
      updatedAt: now,
      feedback: normalizeFeedback(payload.feedback),
      thumbnails: caseThumbnailsFromPayload(payload),
      personalMaster: true,
      pinned: true,
      payload
    };
    const byId = new Map(state.caseLibrary.map((caseItem) => [String(caseItem.id), caseItem]));
    byId.set(id, item);
    state.caseLibrary = sortCaseItems(Array.from(byId.values())).slice(0, caseLibraryMaxCases);
    state.caseLibraryTotalCount = state.caseLibrary.length;
    state.caseLibraryFullyLoaded = true;
    state.caseStorage = {
      ...state.caseStorage,
      caseCount: state.caseLibrary.length,
      loadedCaseCount: state.caseLibrary.length,
      fullyLoaded: true
    };
    invalidateDerivedData();
    renderCaseLibrary();
    renderPersonalProfile();
    if (mode === "palm") renderPalmReport();
    if (mode === "face") renderFaceReport();
    await persistCaseLibrary();
    if (!options.silent) {
      const status = $("#personal-profile-status");
      if (status) status.textContent = `${mode === "palm" ? "手相" : mode === "face" ? "面相" : "八字"}主档案已更新`;
    }
    return true;
  }

  function initReports() {
    $("#make-palm-report").addEventListener("click", () => {
      renderPalmReport();
    });
    $("#make-face-report").addEventListener("click", () => {
      renderFaceReport();
    });
    $("#make-bazi-report").addEventListener("click", () => {
      renderBaziReport();
    });
    $("#export-bazi-json").addEventListener("click", () => {
      exportAnalysisJson("bazi");
    });
    $("#save-palm-case").addEventListener("click", () => {
      saveCase("palm");
    });
    $("#save-face-case").addEventListener("click", () => {
      saveCase("face");
    });
    $("#save-bazi-case").addEventListener("click", () => {
      saveCase("bazi");
    });
    $("#case-feedback-rating").addEventListener("change", invalidateDerivedData);
    $("#case-feedback-note").addEventListener("input", invalidateDerivedData);
    $("#case-evidence-filter").addEventListener("change", () => {
      state.caseLibraryVisibleCount = caseLibraryInitialRenderLimit;
      renderCaseLibrary();
    });
    $("#export-case-library").addEventListener("click", () => {
      exportCaseLibrary();
    });
    $("#export-geometry-training").addEventListener("click", () => {
      exportGeometryTrainingDataset();
    });
    $("#import-geometry-training").addEventListener("change", (event) => {
      importGeometryTrainingDataset(event.target.files);
    });
    ["mode", "source", "reviewStatus", "targetKind"].forEach((key) => {
      const node = $(`#geometry-training-filter-${key}`);
      if (!node) return;
      node.addEventListener("change", () => {
        state.geometryTrainingFilters[key] = node.value || "all";
        renderGeometryTrainingPanel();
      });
    });
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const timelineButton = event.target.closest("[data-timeline-nav]");
      if (timelineButton) {
        navigateTimeline(timelineButton.dataset.timelineMode, timelineButton.dataset.timelineNav);
        return;
      }
      const proportionButton = event.target.closest("[data-face-proportion-calibrate]");
      if (proportionButton) {
        startFaceProportionCalibration();
        return;
      }
      const creaseSplitButton = event.target.closest("[data-crease-split]");
      if (creaseSplitButton) {
        const row = creaseSplitButton.closest(".crease-review-row");
        const splitInput = row && row.querySelector("[data-crease-split-point]");
        splitCreasePolyline(
          creaseSplitButton.dataset.creaseSampleId,
          creaseSplitButton.dataset.creasePolylineKey,
          Number(splitInput && splitInput.value)
        );
        return;
      }
      const reconnectSelectButton = event.target.closest("[data-crease-reconnect-select]");
      if (reconnectSelectButton) {
        toggleCreaseReconnectSelection(
          reconnectSelectButton.dataset.creaseSampleId,
          reconnectSelectButton.dataset.creasePolylineKey
        );
        return;
      }
      const reconnectRunButton = event.target.closest("[data-crease-reconnect-run]");
      if (reconnectRunButton) {
        reconnectSelectedCreasePolylines();
        return;
      }
      const reconnectClearButton = event.target.closest("[data-crease-reconnect-clear]");
      if (reconnectClearButton) {
        clearCreaseReconnectSelection();
        return;
      }
      const creaseUndoButton = event.target.closest("[data-crease-edit-undo]");
      if (creaseUndoButton) {
        undoLastCreaseGeometryEdit(creaseUndoButton.dataset.creaseSampleId);
        return;
      }
      const creaseReviewButton = event.target.closest("[data-crease-polyline-review]");
      if (creaseReviewButton) {
        setCreasePolylineReview(
          creaseReviewButton.dataset.creaseSampleId,
          creaseReviewButton.dataset.creasePolylineKey,
          creaseReviewButton.dataset.creasePolylineReview
        );
        return;
      }
      const semanticButton = event.target.closest("[data-crease-semantic-action]");
      if (semanticButton) {
        const row = semanticButton.closest(".crease-review-row");
        const semanticInput = row && row.querySelector("[data-crease-semantic-key]");
        setCreaseSemanticReview(
          semanticButton.dataset.creaseSampleId,
          semanticButton.dataset.creasePolylineKey,
          semanticInput ? semanticInput.value : "",
          semanticButton.dataset.creaseSemanticAction
        );
        return;
      }
      const faceObservationButton = event.target.closest("[data-face-observation-action]");
      if (faceObservationButton) {
        const outcome = faceObservationRuntime.apply(
          state.faceSamples,
          faceObservationButton.dataset.faceObservationSampleId,
          faceObservationButton.dataset.faceObservationKey,
          faceObservationButton.dataset.faceObservationAction
        );
        if (outcome.changed) {
          invalidateDerivedData();
          renderFaceReport();
          renderGeometryTrainingPanel();
        }
        const status = $("#face-status");
        if (status && outcome.message) status.textContent = outcome.message;
        return;
      }
      const hairlineButton = event.target.closest("[data-face-hairline-action]");
      if (hairlineButton) {
        const action = hairlineButton.dataset.faceHairlineAction;
        const profile = faceProportionProfile(state.faceSamples);
        const sample = state.faceSamples.find((item) => item.id === profile.sampleId);
        const outcome = faceThirdsRuntime.apply(sample, action);
        if (outcome.changed) {
          invalidateDerivedData();
          renderGeometryTrainingPanel();
          renderFaceReport();
          if (sample) redrawPreviewForSample("face", sample, sample.modelResult);
          if (personalProfileModeIsActive("face") && ["confirm", "clear"].includes(action)) {
            savePersonalMasterCase("face", { silent: true }).catch((error) => {
              const profileStatus = $("#personal-profile-status");
              if (profileStatus) profileStatus.textContent = `面相主档保存失败：${shortError(error)}`;
            });
          }
        }
        const status = $("#face-status");
        if (status && outcome.message) status.textContent = outcome.message;
        if (outcome.restart) startFaceProportionCalibration();
        return;
      }
      const reviewButton = event.target.closest("[data-training-review-id]");
      if (reviewButton) {
        setGeometryTrainingItemReview(
          reviewButton.dataset.trainingReviewId,
          reviewButton.dataset.trainingReviewStatus
        );
        return;
      }
      const caseMoreButton = event.target.closest("[data-case-library-more]");
      if (caseMoreButton) {
        showMoreCaseLibrary();
        return;
      }
      const bulkButton = event.target.closest("[data-training-bulk-status]");
      if (!bulkButton) return;
      setGeometryTrainingFilteredReview(bulkButton.dataset.trainingBulkStatus);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !(event.target instanceof Element)) return;
      const jumpInput = event.target.closest("[data-timeline-jump-input]");
      if (!jumpInput) return;
      event.preventDefault();
      navigateTimeline(jumpInput.dataset.timelineJumpInput, "jump");
    });
    $("#import-case-library").addEventListener("change", (event) => {
      importCaseLibrary(event.target.files);
    });
    $("#import-model-result").addEventListener("change", (event) => {
      importModelResults(event.target.files);
    });
    initModelEndpointControls();
    initFeatureControls();
    initManualOverrides();
    initAnnotationControls();
    initNextShotGuide();

    loadCaseLibrary();
    scheduleGeometryTrainingLibraryLoad();
    renderPalmReport();
    renderCaseLibrary();
  }

  function startFaceProportionCalibration() {
    activateMode("face");
    const profile = faceProportionProfile(state.faceSamples);
    const sample = state.faceSamples.find((item) => item.id === profile.sampleId) || latestSampleForMode("face");
    const status = $("#face-status");
    if (!sample || !sample.modelResult) {
      if (status) status.textContent = "先上传一张完整、平视的正脸图。";
      return;
    }
    const orientation = sample.faceOrientation || sample.metrics && sample.metrics.faceOrientation || null;
    const eligibility = faceMeasurementEligibility(sample, orientation);
    const hairline = (sample.modelResult.keypoints || []).find((item) => item && item.key === "hairline_center");
    if (!eligibility.eligible || !hairline) {
      if (status) status.textContent = eligibility.reasons[0] || "当前识别没有发际参考点，先补拍完整正脸。";
      return;
    }
    state.faceHairlineCalibrationSampleId = sample.id;
    state.geometryOverlay.face.model = true;
    state.geometryOverlay.face.edit = true;
    const modelToggle = $('[data-geometry-mode="face"] [data-geometry-toggle="model"]');
    const editToggle = $('[data-geometry-mode="face"] [data-geometry-toggle="edit"]');
    if (modelToggle) modelToggle.checked = true;
    if (editToggle) editToggle.checked = true;
    const canvas = $("#face-canvas");
    if (canvas) canvas.style.cursor = "crosshair";
    if (status) status.textContent = "请直接点照片中央真实可见的发际边缘；此时只会移动发际中点，不会误改其他关键点。";
    if (sample) {
      redrawPreviewForSample("face", sample, sample.modelResult);
      renderOverlaySummary("face", sample);
    }
    if (canvas && typeof canvas.scrollIntoView === "function") {
      canvas.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function initManualOverrides() {
    $("#manual-palm-regions").addEventListener("change", () => {
      state.manualRegions.palm = new Set(checkedValues("manual-palm-regions"));
      renderPalmReport();
    });
    $("#manual-face-regions").addEventListener("change", () => {
      state.manualRegions.face = new Set(checkedValues("manual-face-regions"));
      renderFaceReport();
    });
  }

  function initFeatureControls() {
    [["palm", "palm-features"], ["face", "face-features"]].forEach(([mode, id]) => {
      $all(`#${id} input[type="checkbox"]`).forEach((input) => input.addEventListener("change", () => {
        input.dataset.source = "manual";
        renderModeReport(mode);
      }));
    });
  }

  function initAnnotationControls() {
    $all("#palm-line-annotations select").forEach((select) => {
      select.addEventListener("change", () => {
        select.dataset.auto = "false";
        select.dataset.source = select.value === "unknown" ? "unmarked" : "manual";
        renderPalmReport();
      });
    });
    $all("#face-zone-annotations select").forEach((select) => {
      select.addEventListener("change", () => {
        select.dataset.auto = "false";
        select.dataset.source = select.value === "unknown" ? "unmarked" : "manual";
        renderFaceReport();
      });
    });
  }

  function initNextShotGuide() {
    document.addEventListener("click", (event) => {
      const startButton = event.target.closest("[data-shot-guide-start]");
      if (startButton) {
        const mode = startButton.dataset.shotGuideStart;
        const target = nextShotGuideTarget(mode);
        if (target) startShotGuideTarget(mode, target.sampleType);
        return;
      }
      const stopButton = event.target.closest("[data-shot-guide-stop]");
      if (stopButton) {
        stopShotGuide(stopButton.dataset.shotGuideStop);
        return;
      }
      const nextButton = event.target.closest("[data-shot-guide-next]");
      if (nextButton) {
        advanceShotGuide(nextButton.dataset.shotGuideNext);
        return;
      }
      const cameraButton = event.target.closest("[data-shot-guide-camera]");
      if (cameraButton) {
        startCameraForMode(cameraButton.dataset.shotGuideCamera);
        return;
      }
      const button = event.target.closest("[data-next-shot-type]");
      if (!button) return;
      const mode = button.dataset.nextShotMode;
      const type = button.dataset.nextShotType;
      applyNextShotType(mode, type);
    });
  }

  function applyNextShotType(mode, type) {
    if (!["palm", "face"].includes(mode) || !type) return;
    startShotGuideTarget(mode, type);
  }

  function setNextShotInput(mode, type, message) {
    const input = $(mode === "palm" ? "#palm-photo-type" : "#face-photo-type");
    const status = $(mode === "palm" ? "#palm-status" : "#face-status");
    if (!input || !Array.from(input.options).some((option) => option.value === type)) return false;
    input.value = type;
    if (status) status.textContent = message || `下一张：${sampleTypeLabel(mode, type)}`;
    return true;
  }

  function startCameraForMode(mode) {
    if (mode === "palm") {
      startCamera("palm", $("#palm-video"), $("#palm-status"));
      return;
    }
    if (mode === "face") {
      startCamera("face", $("#face-video"), $("#face-status"));
    }
  }

  function startShotGuideTarget(mode, type) {
    if (!["palm", "face"].includes(mode) || !type) return false;
    const target = shotGuideTargetByType(mode, type);
    if (!setNextShotInput(mode, type, `向导目标：${sampleTypeLabel(mode, type)}`)) return false;
    const previous = state.shotGuides[mode] || {};
    state.shotGuides[mode] = {
      active: true,
      currentType: type,
      currentLabel: target ? target.label : sampleTypeLabel(mode, type),
      action: target ? target.action : shotActionForType(mode, type),
      reason: target ? target.reason : "手动设为下一张",
      completedTypes: Array.isArray(previous.completedTypes) ? previous.completedTypes : [],
      confirmedTypes: Array.isArray(previous.confirmedTypes) ? previous.confirmedTypes : [],
      qualityGate: previous.qualityGate || null,
      startedAt: previous.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    renderModeReport(mode);
    return true;
  }

  function stopShotGuide(mode) {
    if (!["palm", "face"].includes(mode)) return;
    state.shotGuides[mode] = null;
    const status = $(mode === "palm" ? "#palm-status" : "#face-status");
    if (status) status.textContent = "拍照向导已退出";
    renderModeReport(mode);
  }

  function advanceShotGuide(mode, completedType = "") {
    if (!completedType && state.shotGuides[mode] && state.shotGuides[mode].active) {
      completedType = state.shotGuides[mode].currentType;
    }
    const next = nextShotGuideTarget(mode, completedType);
    if (next) return startShotGuideTarget(mode, next.sampleType);
    const previous = state.shotGuides[mode] || {};
    state.shotGuides[mode] = {
      active: false,
      currentType: "",
      currentLabel: "补拍任务已完成",
      completedTypes: Array.isArray(previous.completedTypes) ? previous.completedTypes : [],
      completedAt: new Date().toISOString()
    };
    const status = $(mode === "palm" ? "#palm-status" : "#face-status");
    if (status) status.textContent = "补拍向导已完成";
    renderModeReport(mode);
    return true;
  }

  function completeShotGuideCapture(mode, sample) {
    const guide = state.shotGuides[mode];
    if (!guide || !guide.active || !sample) return false;
    const gate = shotGuideQualityGate(mode, guide, sample);
    guide.qualityGate = gate;
    guide.updatedAt = new Date().toISOString();
    if (!gate.accepted) {
      state.shotGuides[mode] = {
        ...guide,
        qualityGate: gate,
        active: true
      };
      setNextShotInput(mode, guide.currentType, `需要重拍：${gate.reason}`);
      renderModeReport(mode);
      return true;
    }
    const capturedType = sample.type;
    guide.completedTypes = Array.from(new Set([...(guide.completedTypes || []), capturedType]));
    guide.confirmedTypes = Array.from(new Set([...(guide.confirmedTypes || []), capturedType]));
    const next = nextShotGuideTarget(mode, capturedType);
    if (next) {
      startShotGuideTarget(mode, next.sampleType);
      const status = $(mode === "palm" ? "#palm-status" : "#face-status");
      if (status) status.textContent = `${gate.statusLabel}，下一张：${sampleTypeLabel(mode, next.sampleType)}`;
      return true;
    }
    state.shotGuides[mode] = {
      ...guide,
      active: false,
      currentType: "",
      currentLabel: "补拍任务已完成",
      qualityGate: gate,
      completedAt: new Date().toISOString()
    };
    const status = $(mode === "palm" ? "#palm-status" : "#face-status");
    if (status) status.textContent = `${gate.statusLabel}，补拍向导已完成`;
    renderModeReport(mode);
    return true;
  }

  function shotGuideQualityGate(mode, guide, sample) {
    const expectedType = guide.currentType || "";
    const quality = Number(sample.quality || 0);
    const suggestedType = sample.suggestedType || (sample.metrics && sample.metrics.suggestedType) || sample.type;
    const warnings = Array.isArray(sample.warnings) ? sample.warnings : [];
    const hardWarnings = warnings.filter((warning) => ["光线偏暗", "曝光偏亮", "对比不足", "线条不清", "主体不明显", "拍得太远", "主体偏边"].includes(warning));
    const typeMatches = !expectedType || sample.type === expectedType;
    const suggestedDifferent = expectedType && !isDetailShotType(expectedType) && suggestedType && suggestedType !== "mixed" && suggestedType !== expectedType;
    const lowQuality = quality < shotGuideMinimumQuality || hardWarnings.length >= 2;
    const needsRetakeForType = suggestedDifferent && quality < shotGuideHighQuality;
    const modeMismatch = sampleModeMismatch(sample);
    const analysisBlock = sampleAnalysisBlockReason(sample);
    const faceCaptureQuality = mode === "face" ? faceCaptureQualityForSample(sample) : null;
    const nativeFaceRetake = Boolean(faceCaptureQuality && faceCaptureQuality.reviewRequired);
    const accepted = !modeMismatch && !analysisBlock && !nativeFaceRetake && !lowQuality && typeMatches && !needsRetakeForType;
    const confidenceTier = quality >= shotGuideHighQuality ? "high" : accepted ? "usable" : "retake";
    let reason = "";
    if (modeMismatch) {
      const evidence = sample.modeMismatch || (sample.modelResult && sample.modelResult.modeMismatch) || {};
      reason = evidence.label || "原生探测发现图片类别与当前入口不一致";
    } else if (analysisBlock) {
      reason = analysisBlock.detail;
    } else if (nativeFaceRetake) {
      reason = `原生人脸捕获质量 ${percent(faceCaptureQuality.score)}，低于 ${percent(faceCaptureQuality.threshold)}；请补拍光线均匀、清晰居中的照片`;
    } else if (lowQuality) {
      reason = hardWarnings.length ? hardWarnings.slice(0, 2).join("、") : `图像置信 ${percent(quality)} 偏低`;
    } else if (!typeMatches) {
      reason = `拍到${sampleTypeLabel(mode, sample.type)}，当前目标是${sampleTypeLabel(mode, expectedType)}`;
    } else if (needsRetakeForType) {
      reason = `系统更像${sampleTypeLabel(mode, suggestedType)}，请按${sampleTypeLabel(mode, expectedType)}重拍`;
    } else if (confidenceTier === "high") {
      reason = `图像置信 ${percent(quality)}，目标角度可确认`;
    } else {
      reason = `图像置信 ${percent(quality)}，可用但建议后续补局部近照`;
    }
    return {
      accepted,
      status: accepted ? (confidenceTier === "high" ? "confirmed" : "usable") : "retake",
      statusLabel: accepted ? (confidenceTier === "high" ? "高质确认" : "可用确认") : "需要重拍",
      reason,
      mode,
      expectedType,
      capturedType: sample.type,
      suggestedType,
      quality: roundMetric(quality),
      threshold: shotGuideMinimumQuality,
      highQualityThreshold: shotGuideHighQuality,
      warnings,
      hardWarnings,
      modeMismatch,
      analysisBlock,
      faceCaptureQuality,
      checkedAt: new Date().toISOString()
    };
  }

  function isDetailShotType(type) {
    return ["palm_main_detail", "palm_sun_wealth_detail", "palm_helper_detail", "forehead", "eyes", "nose", "mouth_jaw"].includes(type);
  }

  function renderModeReport(mode) {
    if (mode === "palm") renderPalmReport();
    if (mode === "face") renderFaceReport();
  }

  function traditionalEvidenceReady(features, annotations) {
    return features.length > 0 || annotations.some((item) => item.active && ["manual", "manual_semantic_review", "model_adapter"].includes(item.source));
  }

  function traditionalEvidencePending(mode) {
    return `<p><b>传统语义待复核</b>：确认了${mode === "palm" ? "掌面与未分类线纹" : "面部关键点和比例"}，不生成${mode === "palm" ? "趋势分、流年或线名解释" : "趋势分或运势建议"}</p>`;
  }

  function noEvidenceReport(mode, coverage, readiness, fallbackPlan, samples) {
    const unresolved = samples.some((sample) => sample && sample.noTargetEvidence && sample.noTargetEvidence.status === "target_unresolved");
    const status = fallbackPlan.status;
    const title = status === "no_target" ? unresolved ? "目标识别尚未确认" : "未识别到可分析目标" : status === "wrong_mode" ? "图片类别不符" : status === "waiting" ? "等待照片" : "暂不出结论";
    const reason = status === "no_target"
      ? unresolved ? "本类别未检出目标，另一类别反查未完成，不能确认图片内容。" : "手部与面部检测都没有发现目标，这张图片不会进入分析。"
      : status === "wrong_mode" ? "图片属于另一类别，请按样本卡片提示切换入口。" : status === "waiting" ? `请先上传清晰的${mode === "palm" ? "手掌" : "脸部"}照片。` : "图片没有通过主体、姿势、角度或质量门槛。";
    return `
      ${noticeCard()}
      <section class="report-card evidence-gate-report">
        <h3>${title}</h3>
        <p>${reason}</p>
        <p class="muted">没有有效样本时，系统不会用默认趋势分、固定关键点或通用命理文案代替图片证据。</p>
        ${coverageBlock(coverage)}
        ${recognitionReadinessBlock(readiness)}
        ${recognitionFallbackBlock(fallbackPlan)}
        ${diagnosticsBlock(samples)}
      </section>
    `;
  }

  function renderPalmReport() {
    state.renderedReports.palm = true;
    const features = checkedValues("palm-features");
    const lineAnnotations = collectPalmLineAnnotations();
    const dominant = $("#dominant-hand").value;
    const side = $("#palm-side").value;
    const coverage = recognitionCoverage("palm", state.palmSamples);
    const matrix = recognitionMatrix("palm", state.palmSamples);
    const checklist = shotChecklist("palm", coverage, matrix, lineAnnotations);
    const readiness = recognitionReadiness("palm", coverage, matrix, checklist, state.palmSamples);
    const fallbackPlan = recognitionFallbackPlan("palm", coverage, matrix, checklist, readiness, state.palmSamples);
    if (!coverage.sampleCount) {
      setHtml($("#palm-report"), noEvidenceReport("palm", coverage, readiness, fallbackPlan, state.palmSamples));
      return;
    }
    const personalActive = personalProfileModeIsActive("palm");
    const traditionalReady = personalActive || traditionalEvidenceReady(features, lineAnnotations);
    if (traditionalReady && awaitTraditionalRules("palm", $("#palm-report"))) return;
    const experience = experienceProfile("palm");
    const scores = traditionalReady ? applyExperienceToScores(palmScores(features, lineAnnotations), experience) : null;
    const timelineRange = timelineRangeFromInputs();
    const timeline = traditionalReady ? (personalActive ? palmTimeline(scores, timelineRange) : palmTimelineProvider(scores, timelineRange)) : null;
    const activeRules = traditionalReady ? features.map((key) => rulesFor("palm")[key]).filter(Boolean) : [];
    const similarCases = similarCaseProfile("palm", state.palmSamples);
    const similarCalibration = similarCaseCalibration(similarCases);
    const nextShots = nextShotPlan("palm", coverage, matrix, lineAnnotations);
    const dominantText = dominant === "right"
      ? "右手权重更高，偏看后天现实发展。"
      : dominant === "left"
        ? "左手权重更高，偏看后天现实发展。"
        : "左右较均衡，右手略重，先天与后天差距不宜拉得过大。";
    const sideText = side === "right" ? "当前以右手为主。" : side === "left" ? "当前以左手为辅。" : "当前未定左右。";
    const orientationText = handOrientationReportText(state.palmMetrics ? state.palmMetrics.handOrientation : null, side);
    const personalAnalysis = personalActive
      ? buildPersonalAnalysis("palm", { samples: state.palmSamples.map(sampleForExport), lineAnnotations, features, scores, timeline })
      : null;

    setHtml($("#palm-report"), `
      ${noticeCard()}
      ${personalAnalysisBlock(personalAnalysis)}
      <section class="report-card">
        <h3>${traditionalReady ? "总断" : "识别与证据"}</h3>
        <p>${dominantText}${sideText}${orientationText}${traditionalReady ? " 已确认特征合并复核，不凭单线下结论。" : " 先报告照片实测内容。"}</p>
        ${traditionalReady ? "" : traditionalEvidencePending("palm")}
        ${coverageBlock(coverage)}
        ${recognitionReadinessBlock(readiness)}
        ${recognitionFallbackBlock(fallbackPlan)}
        ${diagnosticsBlock(state.palmSamples)}
        ${creaseCandidateEvidenceBlock(state.palmSamples)}
        ${experienceBlock(experience)}
        ${similarCaseBlock(similarCases)}
        ${similarCaseCalibrationBlock(similarCalibration)}
        ${matrixBlock(matrix)}
        ${shotChecklistBlock("palm", checklist)}
        ${nextShotBlock(nextShots)}
        ${traditionalReady ? `<div class="score-grid">
          ${scoreBox("事业", scores.career)}
          ${scoreBox("财运", scores.wealth)}
          ${scoreBox("感情", scores.love)}
          ${scoreBox("精力", scores.vitality)}
        </div>` : ""}
      </section>
      <section class="report-card">
        <h3>可见特征对照</h3>
        ${activeRules.length ? activeRules.map(ruleCard).join("") : `<p class="muted">人工确认可见特征后，传统解释才会展开。</p>`}
      </section>
      ${sourceEvidenceBlock(activeRules, "palm")}
      ${traditionalReady ? `<section class="report-card">
        <h3>贵人线、太阳线、财运纹</h3>
        <p>${helperText(features, lineAnnotations)}</p>
        <p>${sunText(features, lineAnnotations)}</p>
        <p>${moneyText(features, lineAnnotations)}</p>
      </section>` : ""}
      <section class="report-card">
        <h3>细线标注层</h3>
        ${annotationBlock(lineAnnotations, "生命线、智慧线、感情线、命运线、太阳线、财运纹、贵人线、婚姻线尚未细标。")}
      </section>
      ${traditionalReady ? `<section class="report-card">
        <h3>逐年详细解读</h3>
        <p class="muted">${timelineRangeText(timelineRange)}</p>
        ${detailedTimelineBlock("palm", timeline, timelineRange, ["career", "wealth", "love", "health"])}
      </section>` : ""}
    `);
  }

  function palmScores(features, annotations = []) {
    const weights = Object.fromEntries(specsFor("palm").map(({ key }) => [key, annotationWeight(annotationStatus(annotations, key))]));
    return traditionalRules.palmScores(features, weights);
  }

  function scoreBox(label, value) {
    return `<div class="score-box"><span>${label}</span><b>${value}</b><small class="muted">趋势分</small></div>`;
  }

  function ruleCard(rule) {
    const refs = Array.isArray(rule.sourceRefs) ? rule.sourceRefs : [];
    const tags = refs.length
      ? sourceRefTags(refs)
      : (rule.sources || []).map((source) => `<span class="tag gold">${escapeHtml(source)}</span>`).join("");
    return `
      <div class="mini-block">
        <p><b>${escapeHtml(rule.title)}</b>：${escapeHtml(rule.text)}</p>
        <div class="tag-row">${tags}</div>
      </div>
    `;
  }

  function sourceRefsForRules(rules, mode) {
    const refs = [
      ...(sourceRegistry && sourceRegistry.baseRefs && sourceRegistry.baseRefs[mode]
        ? sourceRegistry.baseRefs[mode]
        : []),
      ...rules.flatMap((rule) => Array.isArray(rule.sourceRefs) ? rule.sourceRefs : [])
    ];
    return sourceRegistry && typeof sourceRegistry.uniqueRefs === "function"
      ? sourceRegistry.uniqueRefs(refs)
      : Array.from(new Set(refs));
  }

  function sourceEvidenceSnapshot(mode, rules) {
    const refs = sourceRefsForRules(rules, mode);
    if (sourceRegistry && typeof sourceRegistry.citationSnapshot === "function") {
      return sourceRegistry.citationSnapshot(refs);
    }
    return {
      registryVersion: "unavailable",
      verifiedAt: "",
      refs,
      items: [],
      boundaries: ["source_registry_unavailable"]
    };
  }

  function sourceRefTags(refs) {
    if (!sourceRegistry || typeof sourceRegistry.resolve !== "function") {
      return refs.map((ref) => `<span class="tag gold">${escapeHtml(ref)}</span>`).join("");
    }
    return sourceRegistry.uniqueRefs(refs).map((ref) => {
      const item = sourceRegistry.resolve(ref);
      if (!item) return "";
      const tone = item.tierTone === "green" ? "green" : "gold";
      const locator = item.locator ? ` · ${item.locator}` : "";
      return `<span class="tag ${tone}" title="${escapeHtml(item.tierLabel)}">${escapeHtml(item.shortLabel + locator)}</span>`;
    }).join("");
  }

  function sourceEvidenceBlock(rules, mode) {
    const snapshot = sourceEvidenceSnapshot(mode, rules);
    if (!snapshot.items.length) {
      return `
        <section class="report-card source-evidence-card">
          <h3>依据与证据等级</h3>
          <p class="muted">来源注册表尚未加载，本次结果只按页面规则展示，不把它当作已核验引用。</p>
        </section>
      `;
    }
    return `
      <section class="report-card source-evidence-card">
        <h3>依据与证据等级</h3>
        <p>本报告把传统分类、客观测量、医学资料、识别技术和科学边界分开。绿色资料支持位置、测量或技术事实；金色资料只支持传统术语、文化解释或结论限制。</p>
        <details class="evidence-details">
          <summary>展开 ${snapshot.items.length} 条页级或章节级依据</summary>
          <div class="evidence-list">
            ${snapshot.items.map((item) => {
              const tone = item.tierTone === "green" ? "green" : "gold";
              const location = item.locator ? `<p><b>定位：</b>${escapeHtml(item.locator)}</p>` : "";
              const link = item.url
                ? `<a class="evidence-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">查看来源说明</a>`
                : "";
              return `
                <article class="evidence-row">
                  <div class="evidence-row-head">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span class="tag ${tone}">${escapeHtml(item.tierLabel)}</span>
                  </div>
                  ${location}
                  <p><b>本页用途：</b>${escapeHtml(item.scope)}</p>
                  <p class="muted"><b>不能推出：</b>${escapeHtml(item.limitation)}</p>
                  ${link}
                </article>
              `;
            }).join("")}
          </div>
        </details>
        <p class="muted">来源注册表 ${escapeHtml(snapshot.registryVersion)}，核验日期 ${escapeHtml(snapshot.verifiedAt)}。页面不会在打开时请求这些网络资料或读取原始 PDF。</p>
      </section>
    `;
  }

  function noticeCard() {
    return `
      <section class="report-card warning">
        <h3>边界</h3>
        <p>这是按传统手相、面相、八字体系生成的民俗参考。健康不作疾病诊断，寿命不作死亡时间判断，投资和感情决定仍以现实证据为准。</p>
      </section>
    `;
  }

  function helperText(features, annotations = []) {
    const status = annotationStatus(annotations, "helper_lines");
    return traditionalRules.helperText(features, status, annotationStatusLabel(status));
  }

  function sunText(features, annotations = []) {
    const status = annotationStatus(annotations, "sun_line");
    return traditionalRules.sunText(features, status, annotationStatusLabel(status));
  }

  function moneyText(features, annotations = []) {
    const status = annotationStatus(annotations, "wealth_lines");
    return traditionalRules.moneyText(features, status, annotationStatusLabel(status));
  }

  function annualStageProfile(age) {
    const stages = [
      {
        max: 12,
        label: "童年成长阶段",
        overview: "家庭节奏、学习兴趣和安全感正在成形，稳定环境比追求短期结果更重要。",
        career: "这一阶段以学习方法、兴趣探索和基本习惯为主，不宜过早用职业成败衡量自己。",
        wealth: "财务重点是建立节制、延迟满足和物品管理意识，由家庭做好风险边界。",
        love: "关系主题主要是家庭、同伴和表达需要，练习说清感受并尊重别人边界。",
        health: "优先保证睡眠、户外活动、饮食规律和视力姿势管理，异常情况交给正规医疗评估。",
        modifiers: { career: -6, wealth: -8, love: 0, health: 5 }
      },
      {
        max: 18,
        label: "求学定向阶段",
        overview: "专注力、自我管理和评价体系逐渐定型，关键是形成可持续的学习节奏。",
        career: "把考试、技能和作品当作方向测试，先提高完成度，再决定是否长期投入。",
        wealth: "用预算和储蓄练习代替冲动消费，不因同伴比较承担超出能力的支出。",
        love: "容易受同伴评价和情绪起伏影响，重要关系要以尊重、清楚沟通和不耽误主线为准。",
        health: "熬夜、久坐和压力积累最值得管理，保持运动并及时向可信任的大人求助。",
        modifiers: { career: 0, wealth: -4, love: 1, health: 2 }
      },
      {
        max: 22,
        label: "初入成年阶段",
        overview: "专业方向、第一批可迁移技能和现实选择开始碰撞，允许试错但要留下成果。",
        career: "通过实习、项目、证书或公开作品验证方向，避免只收集信息而没有成品。",
        wealth: "先管现金流和学习投入，谨慎对待借贷、杠杆和高收益承诺。",
        love: "亲密关系要和学业、工作起步并行，明确时间、承诺和各自的发展空间。",
        health: "规律作息和运动会直接影响学习与求职表现，持续不适应及时做正规检查。",
        modifiers: { career: 4, wealth: 0, love: 2, health: 0 }
      },
      {
        max: 27,
        label: "方向取舍阶段",
        overview: "工作方向、生活城市和长期关系都要作取舍，集中做成一两件事，比同时铺开更有效。",
        career: "先选一个能积累能力、履历和人脉的方向，至少完整做完一个项目周期。",
        wealth: "建立应急金、控制固定成本，把技能收入和项目收入分开记录。",
        love: "观察价值观、责任感和冲突处理方式，不用短期热度替代长期适配。",
        health: "工作强度上升时要守住睡眠、力量训练和体检，不用透支换短期进度。",
        modifiers: { career: 6, wealth: 3, love: 3, health: -1 }
      },
      {
        max: 34,
        label: "工作成形阶段",
        overview: "专业标签、收入结构和合作圈层开始成形，机会来自连续成果而非频繁换向。",
        career: "把能证明价值的项目做深，争取更高职责，同时保留可复用的方法和作品。",
        wealth: "提高储蓄率并优化收入结构，重大投资先核对风险、期限和退出条件。",
        love: "关系进入现实协商期，居住、工作、金钱和家庭边界要提前谈清。",
        health: "压力管理、睡眠质量和颈肩腰背维护是长期效率基础，体检异常要按医嘱处理。",
        modifiers: { career: 8, wealth: 6, love: 4, health: -2 }
      },
      {
        max: 42,
        label: "责任加重阶段",
        overview: "工作、家庭和资产安排可能同时加重，分工和边界越清楚，越不容易被多头责任拖住。",
        career: "从个人完成转向带人、协同和资源配置，重要决策保留数据、合同与复盘记录。",
        wealth: "资产配置以分散、流动性和家庭保障为先，不因事业顺利就放大杠杆。",
        love: "忙碌期要主动安排高质量沟通，避免把工作压力变成沉默、指责或控制。",
        health: "把运动、体检和恢复时间写进日程，长期疲劳或不适不能只靠忍耐。",
        modifiers: { career: 7, wealth: 7, love: 2, health: -3 }
      },
      {
        max: 50,
        label: "经验转化阶段",
        overview: "经验、口碑和协调能力更值钱，重点是把做熟的事情教会别人，不再只靠个人体力堆工时。",
        career: "把成熟做法写清，交给团队或形成稳定服务，让经验可以复用、授权或传下去。",
        wealth: "提高优质现金流和风险保障比例，谨慎处理担保、合伙和集中持仓。",
        love: "关系质量取决于共同目标与日常陪伴，重要决定应留出双方讨论和调整空间。",
        health: "关注恢复速度、肌力和代谢管理，按年龄与个人情况接受正规筛查。",
        modifiers: { career: 5, wealth: 7, love: 3, health: -4 }
      },
      {
        max: 65,
        label: "稳定与传承阶段",
        overview: "核心资产、身体节奏和可信关系成为重点，做减法比继续扩张更重要。",
        career: "选择高价值、低消耗的职责，通过指导、顾问或传承发挥经验。",
        wealth: "优先保证流动性、养老安排和防诈骗边界，复杂产品必须看懂再决定。",
        love: "把陪伴、照护和共同生活安排说清，减少替对方做决定造成的摩擦。",
        health: "保持力量、平衡和心肺活动，定期体检并按专业意见管理已知风险。",
        modifiers: { career: 1, wealth: 4, love: 4, health: -5 }
      },
      {
        max: Infinity,
        label: "晚年生活阶段",
        overview: "生活质量、身体维护和家人陪伴优先，所有计划都应服从安全与可持续。",
        career: "保留有意义且负担可控的参与方式，不以高强度工作证明价值。",
        wealth: "现金流、资产安全、授权边界和防诈骗是首要任务，避免复杂高风险交易。",
        love: "稳定联系、清楚照护安排和尊重自主性，比形式上的热闹更重要。",
        health: "按医生建议体检和管理慢性风险，防跌倒、规律活动并保证社会支持。",
        modifiers: { career: -2, wealth: 1, love: 5, health: -6 }
      }
    ];
    return stages.find((stage) => age <= stage.max) || stages[stages.length - 1];
  }

  function annualTrend(score) {
    if (score >= 72) return { key: "advance", label: "可主动推进", tone: "green" };
    if (score >= 62) return { key: "build", label: "稳中有进", tone: "green" };
    if (score >= 52) return { key: "steady", label: "先稳后动", tone: "gold" };
    return { key: "guard", label: "重在守边界", tone: "red" };
  }

  function annualPulseScore(base, year, offset, modifier = 0) {
    const pulse = [-6, -2, 4, 8, 2, -4, 6, 0, -5, 7, 3, -1][mod(year + offset, 12)];
    return clamp(Math.round(Number(base || 55) + pulse + modifier), 35, 88);
  }

  function strongestAnnualDomain(domainScores) {
    return Object.entries(domainScores).sort((a, b) => b[1] - a[1])[0][0];
  }

  function weakestAnnualDomain(domainScores) {
    return Object.entries(domainScores).sort((a, b) => a[1] - b[1])[0][0];
  }

  function annualDomainLabel(key) {
    return { career: "事业", wealth: "财运", love: "感情", health: "健康" }[key] || key;
  }

  function palmDomainAdvice(domain, trendKey) {
    const advice = {
      career: {
        advance: "这一年适合把重要成果放到台前，主动争取职责、项目或平台升级；先用做成的结果谈条件，避免一次承担过多战线。",
        build: "可以稳步增加难度和责任，重点是做完一项能写进履历的成果；机会出现时先核对资源、权限和交付标准。",
        steady: "先补短板、整理流程和稳定交付，再决定是否换方向；不宜因一次受挫就否定已经积累的能力。",
        guard: "把风险高、边界不清的合作放慢，优先守住主业质量与基本收入；重大转向至少准备替代方案和过渡期。"
      },
      wealth: {
        advance: "收入提升更适合来自能力定价、项目结算和长期复利；可提高储蓄与配置效率，但不能把趋势较好等同于稳赚。",
        build: "适合整理收入结构、谈合理回报并建立自动储蓄；副业先小规模验证，不为追高收益牺牲流动性。",
        steady: "以预算、应急金和减少无效支出为主，投资只做自己理解的品种；合同、税务和回款节点要留书面记录。",
        guard: "现金流边界比扩张重要，避免借贷投资、冲动合伙和替人担保；先处理高成本负债，再谈新增配置。"
      },
      love: {
        advance: "关系中可更主动表达和安排共同体验，单身者适合通过真实兴趣与工作圈认识人；承诺仍要经过时间和现实协商。",
        build: "把需求、时间和金钱边界说清，稳定互动比试探更有效；已有关系适合讨论下一阶段的具体安排。",
        steady: "先观察对方处理分歧、责任和压力的方式，不因孤独仓促确定关系；已有关系要减少冷处理和猜测。",
        guard: "情绪起伏时先暂停重大决定，避免翻旧账、控制或用金钱证明感情；必要时借助可信第三方或专业咨询。"
      },
      health: {
        advance: "精力安排相对从容，可建立长期运动、睡眠和体检习惯；状态好也要留恢复日，不用过度训练或连续熬夜。",
        build: "保持规律作息、每周运动和阶段复盘，工作密集期提前安排恢复；任何持续异常都应咨询正规医疗人员。",
        steady: "减少久坐、熬夜和饮食失序，把恢复时间列为硬日程；不要用保健品或意志力替代必要检查。",
        guard: "这一年更应降低透支，优先睡眠、温和运动和按需体检；这里只是生活提醒，不代表疾病判断。"
      }
    };
    return advice[domain][trendKey];
  }

  function annualDomainReviewText(domain) {
    return {
      career: "年中和年末分别用完成率、成果质量与外部反馈复盘，不能只凭主观顺逆判断。",
      wealth: "每季度核对收入、支出、负债和流动资金，用真实账目修正下一阶段安排。",
      love: "用沟通是否更清楚、冲突是否能修复和承诺是否兑现来评价关系质量。",
      health: "用睡眠、运动、体检和持续症状记录观察变化，必要时及时寻求专业帮助。"
    }[domain];
  }

  function palmYearPeriods(year, focus) {
    const variants = [
      `1-3月适合整理计划和资源；4-8月集中推进${annualDomainLabel(focus)}主任务；9-12月处理回款、关系和身体恢复。`,
      `上半年先验证方向并留下阶段成果；第三季度适合集中交付；年末控制新增承诺，完成复盘和下一年预算。`,
      `第一季度做减法和补基础；年中把时间给最重要的一项${annualDomainLabel(focus)}目标；第四季度重合同、现金流和休息。`,
      `年初适合准备与沟通；5-9月进入执行窗口；10月以后以收尾、复盘和关系维护为主，不追求临时扩张。`
    ];
    return variants[mod(year, variants.length)];
  }

  function palmAnnualActions(focus, weakest, stage) {
    const focusActions = {
      career: "确定一个可量化的年度成果，拆成季度交付，并保留作品、数据或复盘证据。",
      wealth: "建立年度预算和应急金目标，每月核对净现金流，不碰看不懂的高收益承诺。",
      love: "安排固定的高质量沟通时间，把期待、边界和现实安排说清楚。",
      health: "把睡眠、运动和体检写入日程，用连续记录观察状态而不是凭一时感觉。"
    };
    const guardActions = {
      career: "对跳槽、创业或重大合作设置最坏情形和退出条件，再决定是否推进。",
      wealth: "减少集中投资、借贷和担保，先守住至少数月的基本生活流动性。",
      love: "冲突时先处理事实和需求，避免冷战、试探或在情绪顶点作决定。",
      health: "连续疲劳或不适及时就医，不把民俗解读当成诊断或治疗依据。"
    };
    return [focusActions[focus], guardActions[weakest], `${stage.label}的年度复盘至少做两次：年中调整一次，年末总结一次。`];
  }

  function palmTimeline(scores, range = timelineRangeFromInputs()) {
    const years = [];
    for (let year = range.startYear; year <= range.endYear; year += 1) {
      years.push(palmTimelineYear(scores, range, year));
    }
    return years;
  }

  function palmTimelineYear(scores, range, year) {
    const age = year - range.birthYear;
    const stage = annualStageProfile(age);
    const domainScores = {
      career: annualPulseScore(scores.career, year, 0, stage.modifiers.career),
      wealth: annualPulseScore(scores.wealth, year, 3, stage.modifiers.wealth),
      love: annualPulseScore(scores.love, year, 7, stage.modifiers.love),
      health: annualPulseScore(scores.vitality, year, 9, stage.modifiers.health)
    };
    const focusKey = strongestAnnualDomain(domainScores);
    const weakestKey = weakestAnnualDomain(domainScores);
    const domains = Object.fromEntries(Object.entries(domainScores).map(([key, score]) => {
      const trend = annualTrend(score);
      return [key, {
        label: annualDomainLabel(key),
        trend: trend.label,
        tone: trend.tone,
        text: `${stage[key]} ${palmDomainAdvice(key, trend.key)} ${annualDomainReviewText(key)}`
      }];
    }));
    const theme = `${stage.label}：${stage.overview}`;
    const focus = annualDomainLabel(focusKey);
    return {
      year,
      age,
      stage: stage.label,
      theme,
      focus,
      overview: `${age}岁处在${stage.label}。这一年的重点是${focus}，${annualDomainLabel(weakestKey)}更需要守边界。${stage.overview}`,
      domains,
      keyPeriods: palmYearPeriods(year, focusKey),
      caution: `${annualDomainLabel(weakestKey)}是这一年相对要谨慎的部分。掌纹只作长期参照，重大决定仍看合同、资金、当时条件和身体状态。`,
      actions: palmAnnualActions(focusKey, weakestKey, stage),
      basis: `依据年龄阶段、当前手相趋势分（事业${scores.career}、财运${scores.wealth}、感情${scores.love}、精力${scores.vitality}）和十二年节奏映射生成。掌纹与状态会变化，未被清晰照片或人工标注确认的细线不作硬断。`,
      evidenceTier: "planning_reference",
      signals: [`重点：${focus}`, `守边界：${annualDomainLabel(weakestKey)}`]
    };
  }

  function createLazyTimelineProvider(mode, range, cacheKey, yearFactory) {
    const startYear = Number(range.startYear);
    const endYear = Number(range.endYear);
    const length = Math.max(0, endYear - startYear + 1);
    const cache = new Map();
    return {
      kind: "lazy_timeline_provider_v1",
      mode,
      range,
      cacheKey,
      length,
      slice(startIndex, endIndex) {
        const start = clamp(Math.floor(Number(startIndex) || 0), 0, length);
        const end = clamp(Math.floor(Number(endIndex) || 0), start, length);
        const page = [];
        for (let index = start; index < end; index += 1) {
          if (!cache.has(index)) cache.set(index, yearFactory(startYear + index));
          page.push(cache.get(index));
        }
        return page;
      },
      indexForYear(year) {
        return clamp(Math.round(Number(year) - startYear), 0, Math.max(0, length - 1));
      },
      stats() {
        return { mode, totalYears: length, materializedYears: cache.size };
      }
    };
  }

  function palmTimelineProvider(scores, range = timelineRangeFromInputs()) {
    const key = `palm:${range.birthYear}:${range.startYear}:${range.endYear}:${scores.career}:${scores.wealth}:${scores.love}:${scores.vitality}`;
    return createLazyTimelineProvider("palm", range, key, (year) => palmTimelineYear(scores, range, year));
  }

  function timelinePageSlice(view) {
    if (!view || !view.timeline || typeof view.timeline.slice !== "function") return [];
    return view.timeline.slice(view.startIndex, view.startIndex + view.pageSize);
  }

  function timelineDefaultStartIndex(timeline, range, pageSize) {
    if (!timeline || !timeline.length) return 0;
    const currentYear = new Date().getFullYear();
    const anchorIndex = typeof timeline.indexForYear === "function"
      ? timeline.indexForYear(currentYear)
      : timeline.findIndex((item) => item.year >= currentYear);
    const boundedIndex = anchorIndex >= 0 ? anchorIndex : timeline.length - 1;
    return Math.floor(boundedIndex / pageSize) * pageSize;
  }

  function prepareTimelineView(mode, timeline, range, focusKeys) {
    const previous = state.timelineViews[mode];
    const sameRange = previous && previous.range && previous.range.startYear === range.startYear && previous.range.endYear === range.endYear;
    const reusableProvider = sameRange
      && previous.timeline && timeline
      && previous.timeline.kind === "lazy_timeline_provider_v1"
      && timeline.kind === "lazy_timeline_provider_v1"
      && previous.timeline.cacheKey === timeline.cacheKey;
    const timelineSource = reusableProvider ? previous.timeline : timeline;
    const maxStart = Math.max(0, Math.floor((timelineSource.length - 1) / detailedTimelinePageSize) * detailedTimelinePageSize);
    const startIndex = sameRange
      ? clamp(previous.startIndex, 0, maxStart)
      : timelineDefaultStartIndex(timelineSource, range, detailedTimelinePageSize);
    const view = {
      mode,
      timeline: timelineSource,
      range,
      focusKeys: Array.isArray(focusKeys) && focusKeys.length ? focusKeys : ["career", "wealth", "love", "health"],
      pageSize: detailedTimelinePageSize,
      startIndex
    };
    state.timelineViews[mode] = view;
    return view;
  }

  function detailedTimelineBlock(mode, timeline, range, focusKeys) {
    const view = prepareTimelineView(mode, timeline, range, focusKeys);
    return `<div class="timeline-shell" data-timeline-shell="${mode}">${timelineViewMarkup(view)}</div>`;
  }

  function timelineViewMarkup(view) {
    const page = timelinePageSlice(view);
    const first = page[0];
    const last = page[page.length - 1];
    const lastStart = Math.max(0, Math.floor((view.timeline.length - 1) / view.pageSize) * view.pageSize);
    const atStart = view.startIndex === 0;
    const atEnd = view.startIndex >= lastStart;
    return `
      <div class="timeline-toolbar" aria-label="逐年翻页">
        <button class="secondary-action" type="button" data-timeline-nav="first" data-timeline-mode="${view.mode}" ${atStart ? "disabled" : ""}>最早</button>
        <button class="secondary-action" type="button" data-timeline-nav="previous" data-timeline-mode="${view.mode}" ${atStart ? "disabled" : ""}>上一组</button>
        <button class="secondary-action" type="button" data-timeline-nav="next" data-timeline-mode="${view.mode}" ${atEnd ? "disabled" : ""}>下一组</button>
        <button class="secondary-action" type="button" data-timeline-nav="last" data-timeline-mode="${view.mode}" ${atEnd ? "disabled" : ""}>最晚</button>
        <div class="timeline-jump">
          <label>跳到年份<input type="number" min="${view.range.startYear}" max="${view.range.endYear}" value="${first ? first.year : view.range.startYear}" data-timeline-jump-input="${view.mode}"></label>
          <button class="secondary-action" type="button" data-timeline-nav="jump" data-timeline-mode="${view.mode}">查看</button>
        </div>
        <span class="muted timeline-page-summary">${first && last ? `${first.year}-${last.year} · ${view.startIndex + 1}-${view.startIndex + page.length}/${view.timeline.length}` : "无年份"}</span>
      </div>
      <div class="timeline" data-timeline-page="${view.mode}" aria-live="polite">${page.map((item) => yearDetailCard(item, view.focusKeys)).join("")}</div>
    `;
  }

  function yearDetailCard(item, focusKeys) {
    const domains = focusKeys.map((key) => item.domains[key]).filter(Boolean);
    const signalTags = Array.isArray(item.signals) ? item.signals.map((signal) => `<span class="tag gold">${escapeHtml(signal)}</span>`).join("") : "";
    return `
      <article class="year-detail-card" data-year="${item.year}">
        <header class="year-detail-head">
          <div>
            <div class="year-detail-title"><strong>${item.year}${item.yearPillar ? ` · ${escapeHtml(item.yearPillar)}` : ""}</strong><span>${item.age}岁 · ${escapeHtml(item.stage)}</span></div>
            <div class="tag-row">${signalTags}</div>
          </div>
          <span class="pill strong">重点：${escapeHtml(item.focus)}</span>
        </header>
        <p class="year-overview"><b>全年概况：</b>${escapeHtml(item.overview)}</p>
        <div class="year-domain-grid">
          ${domains.map((domain) => `
            <section class="year-domain">
              <h4>${escapeHtml(domain.label)}<span class="tag ${escapeHtml(domain.tone || "gold")}">${escapeHtml(domain.trend)}</span></h4>
              <p>${escapeHtml(domain.text)}</p>
            </section>
          `).join("")}
        </div>
        <div class="year-guidance">
          ${item.synthesis ? `<p><b>三法合看：</b>${escapeHtml(item.synthesis)}</p>` : ""}
          <p><b>关键时段：</b>${escapeHtml(item.keyPeriods)}</p>
          <p><b>风险提醒：</b>${escapeHtml(item.caution)}</p>
          <div><b>行动建议：</b><ol class="year-actions">${item.actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ol></div>
          <p class="muted"><b>判断依据：</b>${escapeHtml(item.basis)}</p>
        </div>
      </article>
    `;
  }

  function navigateTimeline(mode, action) {
    const view = state.timelineViews[mode];
    if (!view) return;
    const lastStart = Math.max(0, Math.floor((view.timeline.length - 1) / view.pageSize) * view.pageSize);
    if (action === "first") view.startIndex = 0;
    if (action === "previous") view.startIndex = Math.max(0, view.startIndex - view.pageSize);
    if (action === "next") view.startIndex = Math.min(lastStart, view.startIndex + view.pageSize);
    if (action === "last") view.startIndex = lastStart;
    if (action === "jump") {
      const input = $(`[data-timeline-jump-input="${mode}"]`);
      const requested = Number.parseInt(input ? input.value : "", 10);
      if (Number.isFinite(requested)) {
        const boundedYear = clamp(requested, view.range.startYear, view.range.endYear);
        const index = typeof view.timeline.indexForYear === "function"
          ? view.timeline.indexForYear(boundedYear)
          : view.timeline.findIndex((item) => item.year >= boundedYear);
        view.startIndex = Math.floor(Math.max(0, index) / view.pageSize) * view.pageSize;
      }
    }
    const shell = $(`[data-timeline-shell="${mode}"]`);
    if (shell) setHtml(shell, timelineViewMarkup(view));
  }

  function faceProportionProfile(samples = state.faceSamples) {
    const pointKeys = ["hairline_center", "brow_center", "nose_base", "upper_lip", "lower_lip", "jaw_center"];
    const candidates = modeAnalysisSamples(samples).slice(-faceProportionSampleScanLimit)
      .map((sample) => {
        const points = Object.fromEntries(pointKeys.map((key) => [key, faceProportionPoint(sample, key)]));
        const available = pointKeys.filter((key) => points[key]);
        const verified = available.filter((key) => points[key].verified);
        const orientation = sample.faceOrientation || (sample.metrics ? sample.metrics.faceOrientation : null) || null;
        const eligibility = faceMeasurementEligibility(sample, orientation);
        const frontReady = eligibility.eligible;
        return {
          sample,
          points,
          available,
          verified,
          orientation,
          eligibility,
          frontReady,
          score: available.length * 10 + verified.length * 6 + (available.length === pointKeys.length ? 36 : 0) + (frontReady ? 60 : 0) + Number(sample.quality || 0)
        };
      })
      .filter((item) => item.available.length)
      .sort((a, b) => b.score - a.score);
    const candidate = candidates[0];
    if (!candidate) {
      return {
        version: 1,
        status: "empty",
        statusLabel: "等待正脸",
        landmarkCoverage: 0,
        verifiedLandmarkCount: 0,
        requiredLandmarkCount: pointKeys.length,
        confidence: 0,
        courtReady: false,
        lowerReady: false,
        courtRatios: null,
        lowerCourtStatus: "unverified",
        chinSupport: null,
        chinSupportStatus: "unverified",
        lipOcclusion: { possible: false, status: "unverified", label: "待测量" },
        thresholds: faceThirdsRuntime.thresholdSnapshot(faceProportionThresholds)
      };
    }

    const { sample, points, available, verified, frontReady, eligibility } = candidate;
    const courtKeys = ["hairline_center", "brow_center", "nose_base", "jaw_center"];
    const lowerKeys = ["nose_base", "upper_lip", "lower_lip", "jaw_center"];
    const courtAvailable = courtKeys.every((key) => points[key]);
    const lowerAvailable = lowerKeys.every((key) => points[key]);
    const courtOrderValid = courtAvailable &&
      points.hairline_center.y < points.brow_center.y &&
      points.brow_center.y < points.nose_base.y &&
      points.nose_base.y < points.jaw_center.y;
    const lowerOrderValid = lowerAvailable &&
      points.nose_base.y < points.upper_lip.y &&
      points.upper_lip.y <= points.lower_lip.y &&
      points.lower_lip.y < points.jaw_center.y;
    const courtVerified = courtKeys.every((key) => points[key] && points[key].verified);
    const lowerVerified = lowerKeys.every((key) => points[key] && points[key].verified);
    const courtReady = Boolean(frontReady && courtOrderValid && courtVerified);
    const lowerReady = Boolean(frontReady && lowerOrderValid && lowerVerified);
    const courtRatios = courtOrderValid ? calculateFaceCourtRatios(points) : null;
    const chinSupport = lowerOrderValid ? calculateChinSupportRatios(points) : null;
    const lowerCourtStatus = courtReady && courtRatios
      ? faceThirdsRuntime.classifyLowerCourt(courtRatios.lowerIndex, faceProportionThresholds)
      : "unverified";
    const chinSupportStatus = lowerReady && chinSupport
      ? faceThirdsRuntime.classifyChinSupport(chinSupport.chinSupportRatio, faceProportionThresholds)
      : "unverified";
    const lipBandStatus = lowerReady && chinSupport
      ? (chinSupport.lipBandRatio >= faceProportionThresholds.prominentLipBandRatio ? "prominent" : "not_prominent")
      : "unverified";
    const occlusionPossible = Boolean(
      courtReady && lowerReady &&
      lowerCourtStatus !== "short" &&
      chinSupportStatus === "short" &&
      lipBandStatus === "prominent"
    );
    const sourceCounts = faceThirdsRuntime.sourceCounts(available.map((key) => points[key]));
    const status = !eligibility.eligible
      ? "deferred"
      : courtReady && lowerReady
      ? "measured"
      : lowerReady
        ? "lower_measured"
      : verified.length
        ? "partial"
        : available.length === pointKeys.length
          ? sourceCounts.heuristic === available.length ? "template" : "low_confidence"
          : "incomplete";
    const confidenceBase = average(available.map((key) => Number(points[key].confidence || 0)));
    const confidenceFactor = status === "measured" ? 1 : status === "lower_measured" ? 0.82 : status === "partial" ? 0.58 : status === "template" ? 0.28 : status === "low_confidence" ? 0.24 : status === "deferred" ? 0.1 : 0.2;
    const limitations = eligibility.reasons.slice();
    if (!courtOrderValid) limitations.push("三庭关键点缺失或上下顺序异常");
    if (!lowerOrderValid) limitations.push("下庭关键点缺失或上下顺序异常");
    if (!courtVerified) limitations.push("发际线或三庭参考点尚未核验");
    if (!lowerVerified) limitations.push("鼻基底、唇缘或颏点尚未核验");

    return {
      version: 1,
      status,
      statusLabel: faceThirdsRuntime.statusLabel(status),
      sampleId: sample.id,
      sampleName: sample.name,
      sampleType: sample.type,
      orientation: candidate.orientation,
      eligibility,
      hairlineReview: faceThirdsRuntime.review(sample),
      frontReady,
      courtReady,
      lowerReady,
      landmarkCoverage: roundMetric(available.length / pointKeys.length),
      verifiedLandmarkCount: verified.length,
      requiredLandmarkCount: pointKeys.length,
      measurementSource: faceThirdsRuntime.sourceLabel(sourceCounts),
      sourceCounts,
      confidence: roundMetric(clamp(confidenceBase * confidenceFactor * (frontReady ? 1 : 0.62), 0, 1)),
      courtRatios,
      lowerCourtStatus,
      lowerCourtStatusLabel: faceThirdsRuntime.verdictLabel(lowerCourtStatus),
      chinSupport,
      chinSupportStatus,
      chinSupportStatusLabel: faceThirdsRuntime.verdictLabel(chinSupportStatus),
      lipBandStatus,
      lipBandStatusLabel: lipBandStatus === "prominent" ? "唇带较高" : lipBandStatus === "not_prominent" ? "唇带常规" : "待校正",
      lipOcclusion: {
        possible: occlusionPossible,
        status: occlusionPossible ? "review" : lowerReady && courtReady ? "not_indicated" : "unverified",
        label: occlusionPossible ? "存在软组织视觉遮挡可能" : lowerReady && courtReady ? "未见明确遮挡组合" : "待校正后复核",
        reason: occlusionPossible
          ? "下庭整体不短，但唇带较高且下唇到颏点的可见支撑段偏短；需结合无表情正脸和侧脸复核。"
          : "不能仅凭嘴唇厚或单张角度判断骨性下巴长度。"
      },
      landmarks: Object.fromEntries(available.map((key) => [key, {
        x: points[key].x,
        y: points[key].y,
        confidence: points[key].confidence,
        source: points[key].source,
        verified: points[key].verified
      }])),
      thresholds: faceThirdsRuntime.thresholdSnapshot(faceProportionThresholds),
      limitations
    };
  }

  function faceMeasurementEligibility(sample, orientation) {
    const reasons = [];
    const checks = {
      frontType: sample && sample.type === "face_front",
      frontPose: Boolean(orientation && orientation.pose === "front" && Number(orientation.confidence || 0) >= faceProportionThresholds.minimumOrientationConfidence),
      imageQuality: Number(sample && sample.quality || 0) >= faceProportionThresholds.minimumImageQuality,
      nativeCaptureQuality: true,
      singleSubject: true,
      subjectNotClipped: true,
      severeWarningFree: true
    };
    const result = sample && sample.modelResult || {};
    const faceCaptureQuality = faceCaptureQualityForSample(sample);
    if (faceCaptureQuality) checks.nativeCaptureQuality = !faceCaptureQuality.reviewRequired;
    const candidates = Array.isArray(result.subjectCandidates) ? result.subjectCandidates : [];
    if (candidates.length > 1) checks.singleSubject = false;
    const subject = result.subject && result.subject.box
      ? result.subject
      : sample && sample.metrics && sample.metrics.subject && sample.metrics.subject.box
        ? sample.metrics.subject
        : null;
    if (subject && subject.box) {
      const box = subject.box;
      const margin = faceProportionThresholds.subjectClipMargin;
      checks.subjectNotClipped = Number(box.y) > margin
        && Number(box.y) + Number(box.height) < 1 - margin;
    }
    const severeWarnings = new Set(["主体不明显", "拍得太远", "主体偏边", "光线偏暗", "曝光偏亮"]);
    checks.severeWarningFree = !(Array.isArray(sample && sample.warnings) ? sample.warnings : []).some((warning) => severeWarnings.has(warning));
    if (!checks.frontType) reasons.push("当前样本不是完整正脸类型");
    if (!checks.frontPose) reasons.push("面部朝向不是高置信平视正脸");
    if (!checks.imageQuality) reasons.push(`图像质量低于 ${percent(faceProportionThresholds.minimumImageQuality)}`);
    if (!checks.nativeCaptureQuality) reasons.push(`原生人脸捕获质量低于 ${percent(faceProportionThresholds.minimumNativeFaceCaptureQuality)}，需补拍清晰居中的正脸`);
    if (!checks.singleSubject) reasons.push("画面包含多个面部主体，需选择并裁切目标后重识别");
    if (!checks.subjectNotClipped) reasons.push("面部上缘或下缘贴边被裁切，三庭比例可能失真");
    if (!checks.severeWarningFree) reasons.push("曝光、距离或主体位置未通过测量门槛");
    return {
      eligible: Object.values(checks).every(Boolean),
      decision: Object.values(checks).every(Boolean) ? "measure" : "defer",
      checks,
      reasons
    };
  }

  function faceProportionPoint(sample, key) {
    const result = sample && sample.modelResult ? sample.modelResult : null;
    const points = result && Array.isArray(result.keypoints) ? result.keypoints : [];
    const point = points.find((item) => item && item.key === key);
    if (!point || !isUnitCoordinate(point.x) || !isUnitCoordinate(point.y)) return null;
    const source = String(point.source || "");
    const adapter = String(result.adapter || "");
    const heuristic = source.startsWith("heuristic_geometry") ||
      source.endsWith("_estimate") ||
      (!source && ["heuristic-local", "builtin-local-endpoint"].includes(adapter));
    const manualClaim = source.startsWith("manual_");
    const confidence = roundMetric(clamp(Number(point.confidence || result.confidence || 0), 0, 1));
    return {
      x: Number(point.x),
      y: Number(point.y),
      confidence,
      source: source || (heuristic ? "heuristic_geometry" : "model_adapter"),
      verified: (manualClaim ? faceThirdsRuntime.verifiedSource(source) : !heuristic) && confidence >= faceProportionThresholds.minimumVerifiedPointConfidence
    };
  }

  function calculateFaceCourtRatios(points) {
    const upper = points.brow_center.y - points.hairline_center.y;
    const middle = points.nose_base.y - points.brow_center.y;
    const lower = points.jaw_center.y - points.nose_base.y;
    const total = upper + middle + lower;
    if (Math.min(upper, middle, lower, total) <= 0) return null;
    const reference = (upper + middle) / 2;
    return {
      upper: roundMetric(upper / total),
      middle: roundMetric(middle / total),
      lower: roundMetric(lower / total),
      lowerIndex: roundMetric(lower / Math.max(0.001, reference))
    };
  }

  function calculateChinSupportRatios(points) {
    const lowerCourt = points.jaw_center.y - points.nose_base.y;
    const lipBand = points.lower_lip.y - points.upper_lip.y;
    const chinSupport = points.jaw_center.y - points.lower_lip.y;
    if (Math.min(lowerCourt, lipBand, chinSupport) < 0 || lowerCourt <= 0) return null;
    return {
      lowerCourt: roundMetric(lowerCourt),
      lipBand: roundMetric(lipBand),
      chinSupport: roundMetric(chinSupport),
      lipBandRatio: roundMetric(lipBand / lowerCourt),
      chinSupportRatio: roundMetric(chinSupport / lowerCourt)
    };
  }

  function faceProportionBlock(profile) {
    const sample = profile && state.faceSamples.find((item) => item.id === profile.sampleId);
    return faceThirdsRuntime.panel(profile, sample);
  }

  function renderFaceReport() {
    state.renderedReports.face = true;
    const features = checkedValues("face-features");
    const zoneAnnotations = collectFaceZoneAnnotations();
    const coverage = recognitionCoverage("face", state.faceSamples);
    const matrix = recognitionMatrix("face", state.faceSamples);
    const checklist = shotChecklist("face", coverage, matrix, zoneAnnotations);
    const readiness = recognitionReadiness("face", coverage, matrix, checklist, state.faceSamples);
    const fallbackPlan = recognitionFallbackPlan("face", coverage, matrix, checklist, readiness, state.faceSamples);
    if (!coverage.sampleCount) {
      setHtml($("#face-report"), noEvidenceReport("face", coverage, readiness, fallbackPlan, state.faceSamples));
      return;
    }
    const personalActive = personalProfileModeIsActive("face");
    const traditionalReady = personalActive || traditionalEvidenceReady(features, zoneAnnotations);
    if (traditionalReady && awaitTraditionalRules("face", $("#face-report"))) return;
    const experience = experienceProfile("face");
    const scores = traditionalReady ? applyExperienceToScores(faceScores(features, zoneAnnotations), experience) : null;
    const activeRules = traditionalReady ? features.map((key) => rulesFor("face")[key]).filter(Boolean) : [];
    const similarCases = similarCaseProfile("face", state.faceSamples);
    const similarCalibration = similarCaseCalibration(similarCases);
    const nextShots = nextShotPlan("face", coverage, matrix, zoneAnnotations);
    const orientationText = faceOrientationReportText(state.faceMetrics ? state.faceMetrics.faceOrientation : null);
    const proportions = faceProportionProfile(state.faceSamples);
    const personalAnalysis = personalActive
      ? buildPersonalAnalysis("face", { samples: state.faceSamples.map(sampleForExport), zoneAnnotations, features, scores, faceProportions: proportions })
      : null;

    setHtml($("#face-report"), `
      ${noticeCard()}
      ${personalAnalysisBlock(personalAnalysis)}
      <section class="report-card">
        <h3>${traditionalReady ? "总断" : "识别与证据"}</h3>
        <p>${traditionalReady ? "按已确认的三庭、五官和分区合看。" : "先报告照片实测的关键点与比例。"}${orientationText} 单张照片不能替代长期观察。</p>
        ${traditionalReady ? "" : traditionalEvidencePending("face")}
        ${coverageBlock(coverage)}
        ${recognitionReadinessBlock(readiness)}
        ${recognitionFallbackBlock(fallbackPlan)}
        ${diagnosticsBlock(state.faceSamples)}
        ${faceProportionBlock(proportions)}
        ${faceObservationRuntime.panel(state.faceSamples)}
        ${experienceBlock(experience)}
        ${similarCaseBlock(similarCases)}
        ${similarCaseCalibrationBlock(similarCalibration)}
        ${matrixBlock(matrix)}
        ${shotChecklistBlock("face", checklist)}
        ${nextShotBlock(nextShots)}
        ${traditionalReady ? `<div class="score-grid">
          ${scoreBox("规划", scores.plan)}
          ${scoreBox("执行", scores.action)}
          ${scoreBox("资源", scores.resource)}
          ${scoreBox("稳定", scores.stability)}
        </div>` : ""}
      </section>
      <section class="report-card">
        <h3>分区对照</h3>
        ${activeRules.length ? activeRules.map(ruleCard).join("") : `<p class="muted">人工确认可见特征后，分区解释才会展开。</p>`}
      </section>
      ${sourceEvidenceBlock(activeRules, "face")}
      <section class="report-card">
        <h3>分区标注层</h3>
        ${annotationBlock(zoneAnnotations, "三庭、脸型、额头、眉眼、鼻部、口下巴、侧面和气色尚未细标。")}
      </section>
      ${traditionalReady ? `<section class="report-card">
        <h3>建议</h3>
        <p>${faceAdvice(features)}</p>
      </section>` : ""}
    `);
  }

  function collectPalmLineAnnotations() {
    return collectAnnotations("palm-line-annotations", specsFor("palm"));
  }

  function collectFaceZoneAnnotations() {
    return collectAnnotations("face-zone-annotations", specsFor("face"));
  }

  function collectAnnotations(rootId, specs) {
    const root = $(`#${rootId}`);
    return specs.map((spec) => {
      const input = root ? $(`[data-annotation="${spec.key}"]`, root) : null;
      const status = input ? input.value : "unknown";
      const source = status === "unknown" ? "unmarked" : annotationSource(input);
      return {
        ...spec,
        status,
        statusLabel: annotationStatusLabel(status),
        source,
        active: status !== "unknown"
      };
    });
  }

  function annotationStatusLabel(status) {
    return annotationStatusLabels[status] || annotationStatusLabels.unknown;
  }

  function annotationSource(input) {
    if (!input) return "unmarked";
    if (input.dataset.source) return input.dataset.source;
    if (input.dataset.auto === "true") return "auto_heuristic";
    if (input.dataset.auto === "model") return "model_adapter";
    return "manual";
  }

  function annotationStatus(annotations, key) {
    const item = annotations.find((entry) => entry.key === key);
    return item ? item.status : "unknown";
  }

  function annotationWeight(status) {
    if (status === "deep") return 10;
    if (status === "clear") return 7;
    if (status === "balanced") return 6;
    if (status === "light") return 2;
    if (status === "broken") return -2;
    if (status === "weak") return -4;
    if (status === "asymmetric") return -3;
    return 0;
  }

  function annotationStatusNote(status) {
    if (status === "clear") return "可作为当前判断依据。";
    if (status === "deep") return "信号较强，报告中可提高权重。";
    if (status === "light") return "信号偏弱，按保守参考处理。";
    if (status === "broken") return "阶段感明显，需结合年龄节点和多图复核。";
    if (status === "balanced") return "结构较均衡，可作稳定项。";
    if (status === "weak") return "当前按偏弱项提示，不作硬断。";
    if (status === "asymmetric") return "左右或上下不均，需补光线和角度复核。";
    if (status === "need_more") return "当前图不足，先补对应角度。";
    return "等待人工或模型标注。";
  }

  function annotationBlock(annotations, emptyText) {
    const active = annotations.filter((item) => item.active);
    if (!active.length) {
      return `<p class="muted">${emptyText}</p>`;
    }
    return `
      <div class="annotation-grid">
        ${active.map((item) => `
          <div class="annotation-item">
            <strong>${item.label}</strong>
            <div class="case-meta">${item.statusLabel} · ${annotationStatusNote(item.status)}</div>
            <div class="tag-row"><span class="tag ${annotationSourceClass(item.source)}">${annotationSourceLabel(item.source)}</span></div>
            <p class="muted">${item.meaning}</p>
          </div>
        `).join("")}
      </div>
    `;
  }

  function annotationSourceLabel(source) {
    if (source === "auto_heuristic") return "自动预填";
    if (source === "model_adapter") return "模型结果";
    if (source === "manual_semantic_review") return "掌纹二阶段复核";
    if (source === "manual") return "人工复核";
    return "未标注";
  }

  function annotationSourceClass(source) {
    if (source === "auto_heuristic") return "gold";
    if (source === "model_adapter") return "green";
    if (source === "manual_semantic_review") return "green";
    if (source === "manual") return "green";
    return "";
  }

  function faceScores(features, annotations = []) {
    const weights = Object.fromEntries(specsFor("face").map(({ key }) => [key, annotationWeight(annotationStatus(annotations, key))]));
    return traditionalRules.faceScores(features, weights);
  }

  function faceAdvice(features) {
    return traditionalRules.faceAdvice(features);
  }

  function recognitionCoverage(mode, samples) {
    const sampleList = Array.isArray(samples) ? samples : [];
    const usableSamples = modeAnalysisSamples(sampleList);
    const excludedModeMismatchCount = sampleList.filter(sampleModeMismatch).length;
    const blockedSamples = sampleList.filter((sample) => !sampleModeMismatch(sample) && sampleAnalysisBlocked(sample));
    const excludedNoTargetCount = blockedSamples.filter((sample) => sampleAnalysisBlockReason(sample).key === "no_target").length;
    const excludedPoseCount = blockedSamples.filter((sample) => sampleAnalysisBlockReason(sample).key === "hand_pose").length;
    const excludedSurfaceCount = blockedSamples.filter((sample) => sampleAnalysisBlockReason(sample).key === "palm_surface").length;
    const excludedSubjectCount = blockedSamples.filter((sample) => sampleAnalysisBlockReason(sample).key === "subject").length;
    const typeSet = new Set(usableSamples.map((sample) => sample.type));
    const quality = usableSamples.length ? average(usableSamples.map((sample) => sample.quality)) : 0;
    const expected = mode === "palm"
      ? [
          ["palm_front", "掌心主线"],
          ["palm_side", "婚姻线/小指侧边"],
          ["nails", "指甲气色"],
          ["thumb", "拇指意志与逻辑"],
          ["palm_back", "手背骨肉"]
        ]
      : [
          ["face_front", "三庭五官"],
          ["face_side", "侧面骨相"],
          ["face_three_quarter", "立体轮廓"],
          ["eyes", "眉眼神"],
          ["nose", "鼻部财帛"],
          ["mouth_jaw", "口相与下庭"]
        ];
    const covered = expected.filter(([type]) => typeSet.has(type));
    const missing = expected.filter(([type]) => !typeSet.has(type));
    const score = clamp((covered.length / expected.length) * 0.68 + quality * 0.32, 0, 1);
    return {
      score,
      quality,
      covered,
      missing,
      sampleCount: usableSamples.length,
      excludedModeMismatchCount,
      excludedCaptureCount: blockedSamples.length,
      excludedNoTargetCount,
      excludedPoseCount,
      excludedSurfaceCount,
      excludedSubjectCount
    };
  }

  function recognitionMatrix(mode, samples) {
    const usableSamples = modeAnalysisSamples(samples);
    const hasUsableSample = usableSamples.length > 0;
    const manual = state.manualRegions[mode] || new Set();
    const specs = mode === "palm" ? palmCapabilitySpecs() : faceCapabilitySpecs();
    return specs.map((spec) => {
      const matches = usableSamples.filter((sample) => spec.types.includes(sample.type));
      const bestVisibility = matches.length
        ? Math.max(...matches.map((sample) => capabilityVisibilityConfidence(mode, spec, sample)))
        : 0;
      const modelEvidence = usableSamples
        .filter((sample) => importedRegionKeysForSample(sample, mode).includes(spec.key))
        .map((sample) => ({
          sampleId: sample.id,
          sampleName: sample.name,
          sampleType: sample.type,
          confidence: importedRegionConfidence(sample)
        }))
        .sort((a, b) => b.confidence - a.confidence);
      const modelConfidence = modelEvidence.length ? modelEvidence[0].confidence : 0;
      const manualConfirmed = hasUsableSample && manual.has(spec.key);
      const modelConfirmed = modelConfidence >= 0.62;
      const confidence = manualConfirmed
        ? Math.max(0.72, bestVisibility, modelConfidence)
        : Math.max(bestVisibility, modelConfidence);
      const status = confidence >= 0.62 ? "ready" : confidence >= 0.32 ? "partial" : "missing";
      return {
        ...spec,
        status,
        confidence: roundMetric(confidence),
        sampleCount: matches.length,
        modelSampleCount: modelEvidence.length,
        modelConfidence: roundMetric(modelConfidence),
        modelEvidence,
        manualConfirmed,
        modelConfirmed,
        reason: manualConfirmed
          ? "人工确认可见"
          : modelEvidence.length
            ? `${modelConfirmed ? "模型确认可见" : "模型低置信候选"} · ${modelEvidence[0].sampleName || sampleTypeLabel(mode, modelEvidence[0].sampleType)}`
            : matches.length
              ? `${matches.length}张相关图`
              : `缺少${spec.need}`
      };
    });
  }

  function importedRegionConfidence(sample) {
    const result = sample && sample.modelResult || {};
    const modelConfidence = clamp(Number(result.confidence || 0), 0, 1);
    const imageQuality = clamp(Number(sample && sample.quality || 0), 0, 1);
    return roundMetric(clamp(modelConfidence * 0.72 + imageQuality * 0.28, 0, 1));
  }

  function capabilityVisibilityConfidence(mode, spec, sample) {
    const quality = clamp(Number(sample && sample.quality || 0), 0, 1);
    const metrics = sample && sample.metrics || {};
    const centeredness = clamp(Number(metrics.subjectCenteredness || 0), 0, 1);
    const lineClarity = clamp(Number(metrics.lineClarity || 0), 0, 1);
    const symmetry = clamp(Number(metrics.symmetry || 0), 0, 1);
    const orientation = mode === "palm"
      ? sample && (sample.handOrientation || metrics.handOrientation)
      : sample && (sample.faceOrientation || metrics.faceOrientation);
    const orientationConfidence = clamp(Number(orientation && orientation.confidence || 0), 0, 1);
    const detailType = isDetailShotType(sample && sample.type);
    if (spec.evidenceKind === "fine_palm_lines") {
      return roundMetric(clamp(quality * 0.48 + lineClarity * 0.38 + centeredness * 0.14 + (detailType ? 0.12 : 0), 0, 1));
    }
    if (spec.evidenceKind === "palm_lines") {
      return roundMetric(clamp(quality * 0.56 + lineClarity * 0.3 + centeredness * 0.14 + (detailType ? 0.08 : 0), 0, 1));
    }
    if (spec.evidenceKind === "face_front_geometry") {
      return roundMetric(clamp(quality * 0.48 + centeredness * 0.24 + symmetry * 0.2 + orientationConfidence * 0.08, 0, 1));
    }
    if (spec.evidenceKind === "face_pose") {
      return roundMetric(clamp(quality * 0.56 + centeredness * 0.18 + orientationConfidence * 0.26, 0, 1));
    }
    return roundMetric(clamp(quality * 0.72 + centeredness * 0.18 + (detailType ? 0.1 : 0), 0, 1));
  }

  function palmCapabilitySpecs() {
    return [
      { key: "main_lines", label: "三大主线", need: "掌心正面或三线近照", types: ["palm_front", "palm_main_detail"], evidenceKind: "palm_lines" },
      { key: "career_fate", label: "命运线/事业", need: "掌心正面或三线近照", types: ["palm_front", "palm_main_detail"], evidenceKind: "palm_lines" },
      { key: "sun_wealth", label: "太阳线/财运纹", need: "掌心或太阳线/财运纹近照", types: ["palm_front", "palm_sun_wealth_detail"], evidenceKind: "fine_palm_lines" },
      { key: "helper_line", label: "贵人线/辅助纹", need: "掌心或贵人线近照", types: ["palm_front", "palm_helper_detail"], evidenceKind: "fine_palm_lines" },
      { key: "marriage", label: "婚姻线", need: "小指侧边", types: ["palm_side"], evidenceKind: "fine_palm_lines" },
      { key: "thumb", label: "拇指意志逻辑", need: "拇指/虎口", types: ["thumb"], evidenceKind: "shape" },
      { key: "nails", label: "指甲气色", need: "指甲近照", types: ["nails"], evidenceKind: "shape" },
      { key: "back_shape", label: "手背骨肉", need: "手背", types: ["palm_back"], evidenceKind: "shape" }
    ];
  }

  function faceCapabilitySpecs() {
    return [
      { key: "three_parts", label: "三庭五官", need: "正脸", types: ["face_front"], evidenceKind: "face_front_geometry" },
      { key: "profile", label: "侧面骨相", need: "侧脸", types: ["face_side"], evidenceKind: "face_pose" },
      { key: "shape", label: "立体轮廓", need: "三分之二侧脸", types: ["face_three_quarter"], evidenceKind: "face_pose" },
      { key: "forehead", label: "额头/上庭", need: "正脸或额头图", types: ["face_front", "forehead"], evidenceKind: "face_feature" },
      { key: "brow_eye", label: "眉眼神", need: "正脸或眉眼局部", types: ["face_front", "eyes"], evidenceKind: "face_feature" },
      { key: "nose", label: "鼻部形态（传统财帛位）", need: "正脸或鼻部局部", types: ["face_front", "nose"], evidenceKind: "face_feature" },
      { key: "mouth_jaw", label: "口唇/下庭形态", need: "正脸或口下巴局部", types: ["face_front", "mouth_jaw"], evidenceKind: "face_feature" }
    ];
  }

  function matrixBlock(matrix) {
    return `
      <div class="mini-block">
        <p><b>可识别区域矩阵</b>：只对已覆盖区域出较高置信判断，缺失区域保留待补。</p>
        <div class="capability-grid">
          ${matrix.map((item) => `
            <div class="capability-item ${item.status}">
              <strong>${item.label}</strong>
              <div class="case-meta">${statusText(item.status)} · 置信 ${percent(item.confidence)} · ${item.reason}</div>
              ${item.manualConfirmed || item.modelConfirmed ? `<div class="tag-row">${item.manualConfirmed ? `<span class="tag gold">人工校正</span>` : ""}${item.modelConfirmed ? `<span class="tag green">模型确认</span>` : ""}</div>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function statusText(status) {
    if (status === "ready") return "可判断";
    if (status === "partial") return "可粗看";
    return "待补图";
  }

  function coverageBlock(coverage) {
    const coveredText = coverage.covered.length
      ? coverage.covered.map(([, label]) => label).join("、")
      : "暂无标准角度";
    const missingText = coverage.missing.length
      ? coverage.missing.map(([, label]) => label).join("、")
      : "角度完整";
    return `
      <div class="mini-block">
        <p><b>识别覆盖度 ${percent(coverage.score)}</b>：已覆盖 ${coveredText}；待补 ${missingText}。有效样本 ${coverage.sampleCount}，平均图像置信 ${percent(coverage.quality)}。${coverage.excludedModeMismatchCount ? `另有 ${coverage.excludedModeMismatchCount} 张类别不符图片已排除。` : ""}${coverage.excludedNoTargetCount ? `${coverage.excludedNoTargetCount} 张未识别到手或脸的图片已排除。` : ""}${coverage.excludedPoseCount ? `${coverage.excludedPoseCount} 张手掌未摊平。` : ""}${coverage.excludedSurfaceCount ? `${coverage.excludedSurfaceCount} 张掌心/手背待确认。` : ""}${coverage.excludedSubjectCount ? `${coverage.excludedSubjectCount} 张多主体图片待裁切。` : ""}</p>
        <div class="tag-row">
          <span class="tag green">任意图片可入队</span>
          <span class="tag gold">低质图降置信</span>
          <span class="tag green">多角度综合</span>
        </div>
      </div>
    `;
  }

  function recognitionReadiness(mode, coverage, matrix, checklist, samples = []) {
    const sampleCount = Number(coverage && coverage.sampleCount || 0);
    const matrixTotal = Array.isArray(matrix) ? matrix.length : 0;
    const readyRegions = matrixTotal ? matrix.filter((item) => item.status === "ready").length : 0;
    const partialRegions = matrixTotal ? matrix.filter((item) => item.status === "partial").length : 0;
    const missingRegions = matrixTotal ? matrix.filter((item) => item.status === "missing").length : 0;
    const matrixScore = matrixTotal ? clamp((readyRegions + partialRegions * 0.5) / matrixTotal, 0, 1) : 0;
    const warnings = Array.from(new Set((samples || []).flatMap((sample) => sample.warnings || [])));
    const routeReviewCount = (samples || []).filter((sample) => sample && sample.routeEvidence && sample.routeEvidence.needsReview).length;
    const warningPenalty = Math.min(0.22, warnings.length * 0.035 + routeReviewCount * 0.04);
    const score = sampleCount
      ? clamp((coverage.score || 0) * 0.34 + (checklist.completion || 0) * 0.42 + matrixScore * 0.24 - warningPenalty, 0, 1)
      : 0;
    const nextTask = readinessNextTask(mode, checklist);
    const status = readinessStatus(score, coverage, checklist, sampleCount);
    return {
      mode,
      status,
      statusLabel: readinessStatusLabel(status),
      score: roundMetric(score),
      sampleCount,
      quality: roundMetric(coverage.quality || 0),
      coverageScore: roundMetric(coverage.score || 0),
      checklistCompletion: roundMetric(checklist.completion || 0),
      matrixScore: roundMetric(matrixScore),
      readyRegions,
      partialRegions,
      missingRegions,
      pendingTasks: checklist.pendingCount || 0,
      partialTasks: checklist.partialCount || 0,
      warningCount: warnings.length,
      routeReviewCount,
      excludedModeMismatchCount: Number(coverage && coverage.excludedModeMismatchCount || 0),
      excludedNoTargetCount: Number(coverage && coverage.excludedNoTargetCount || 0),
      nextSampleType: nextTask ? nextTask.sampleType || null : null,
      nextLabel: nextTask ? nextTask.label || "" : "",
      nextAction: nextTask ? nextTask.action || "" : "",
      generatedAt: new Date().toISOString()
    };
  }

  function readinessNextTask(mode, checklist) {
    const tasks = checklist && Array.isArray(checklist.tasks) ? checklist.tasks : [];
    return tasks.find((item) => item.status === "pending" && item.action) ||
      tasks.find((item) => item.status === "partial" && item.action) ||
      null;
  }

  function readinessStatus(score, coverage, checklist, sampleCount) {
    if (!sampleCount) return "empty";
    if (score >= 0.78 && (coverage.quality || 0) >= 0.58 && (checklist.pendingCount || 0) <= 2) return "ready";
    if (score >= 0.52) return "coarse";
    return "needs_more";
  }

  function readinessStatusLabel(status) {
    if (status === "ready") return "可正式综合";
    if (status === "coarse") return "可粗看";
    if (status === "needs_more") return "需补图";
    return "等待图片";
  }

  function recognitionReadinessBlock(readiness) {
    if (!readiness) return "";
    const action = readiness.excludedNoTargetCount
      ? "当前图片没有识别到手部或面部，请换成目标完整、居中且占画面主体的清晰照片。"
      : readiness.excludedModeMismatchCount
      ? "当前图片类别与入口不符，请先按原生建议切换手相/面相入口，或回到通用入口重新分流。"
      : readiness.nextAction
      ? readiness.nextAction
      : readiness.status === "empty"
        ? "先上传一张清晰正面图，系统会自动判断是手相还是面相。"
        : "关键区域已基本覆盖，后续以人工复核和案例反馈为主。";
    const tone = readiness.status === "ready" ? "green" : readiness.status === "coarse" ? "gold" : "";
    return `
      <div class="mini-block readiness-block ${escapeHtml(readiness.status)}">
        <p><b>识别就绪度 ${percent(readiness.score)}</b>：<span class="tag ${tone}">${escapeHtml(readiness.statusLabel)}</span> 覆盖 ${percent(readiness.coverageScore)}，补拍完成 ${percent(readiness.checklistCompletion)}，区域矩阵 ${percent(readiness.matrixScore)}。</p>
        <div class="shot-progress readiness-meter" aria-label="识别就绪度 ${percent(readiness.score)}">
          <span style="inline-size: ${percent(readiness.score)}"></span>
        </div>
        <div class="tag-row">
          <span class="tag green">可判断 ${readiness.readyRegions}</span>
          <span class="tag gold">可粗看 ${readiness.partialRegions}</span>
          <span class="tag">待补 ${readiness.missingRegions}</span>
          ${readiness.warningCount ? `<span class="tag red">拍摄风险 ${readiness.warningCount}</span>` : ""}
          ${readiness.routeReviewCount ? `<span class="tag red">分流复核 ${readiness.routeReviewCount}</span>` : ""}
        </div>
        <p>${escapeHtml(action)}</p>
      </div>
    `;
  }

  function recognitionFallbackPlan(mode, coverage, matrix, checklist, readiness, samples = []) {
    const sampleList = Array.isArray(samples) ? samples.filter(Boolean) : [];
    const modeMismatchSamples = sampleList.filter(sampleModeMismatch);
    const noTargetSamples = sampleList.filter(sampleNoTarget);
    const noTargetRejectedCount = Number(coverage && coverage.excludedNoTargetCount || 0);
    const poseRejectedCount = Number(coverage && coverage.excludedPoseCount || 0);
    const surfaceRejectedCount = Number(coverage && coverage.excludedSurfaceCount || 0);
    const subjectRejectedCount = Number(coverage && coverage.excludedSubjectCount || 0);
    const captureRejectedCount = noTargetRejectedCount + poseRejectedCount + surfaceRejectedCount + subjectRejectedCount;
    const warningSet = new Set(sampleList.flatMap((sample) => sample.warnings || []));
    const routeReviewCount = sampleList.filter((sample) => sample.routeEvidence && (sample.routeEvidence.needsReview || sample.routeEvidence.confidence < 0.62)).length;
    const lowQualitySamples = sampleList.filter((sample) => Number(sample.quality || 0) < 0.45);
    const noSubjectSamples = sampleList.filter((sample) => !sample.metrics || !sample.metrics.subject || (sample.warnings || []).includes("主体不明显"));
    const mixedTypeSamples = sampleList.filter((sample) => sample.type === "mixed" || sample.suggestedType === "mixed");
    const maxQuality = sampleList.length ? Math.max(...sampleList.map((sample) => Number(sample.quality || 0))) : 0;
    const actions = [];
    const addAction = (key, label, reason, action, priority, sampleType = null) => {
      if (!key || actions.some((item) => item.key === key)) return;
      actions.push({ key, label, reason, action, priority, sampleType });
    };
    if (!sampleList.length) {
      addAction(
        "upload-first-standard",
        "先拍标准图",
        "当前还没有图片样本。",
        mode === "palm" ? "先上传掌心正面清晰照，掌纹铺满画面。" : "先上传正脸清晰照，五官完整入镜。",
        100,
        mode === "palm" ? "palm_front" : "face_front"
      );
    }
    if (noTargetSamples.length) {
      addAction("replace-no-target", "换一张目标照片", `${noTargetSamples.length} 张图片经手部与面部双检测后都没有找到可分析目标。`, "重新上传手掌或脸部完整、居中、无遮挡且占画面主体的清晰照片。", 112, mode === "palm" ? "palm_front" : "face_front");
    }
    if (modeMismatchSamples.length) {
      const suggestedModes = Array.from(new Set(modeMismatchSamples.map((sample) => {
        const evidence = sample.modeMismatch || (sample.modelResult && sample.modelResult.modeMismatch) || {};
        return evidence.suggestedMode;
      }).filter((value) => ["palm", "face"].includes(value))));
      const suggestedLabel = suggestedModes.length === 1
        ? suggestedModes[0] === "palm" ? "手相" : "面相"
        : "正确类别";
      addAction("correct-mode", "切换识别入口", `${modeMismatchSamples.length} 张图片被原生探测为另一类别，当前类别的几何与传统标注已阻断。`, `改用${suggestedLabel}入口，或回到通用入口重新分流后识别。`, 110);
    }
    if (subjectRejectedCount) {
      addAction("select-subject", "先确认主体", `${subjectRejectedCount} 张图片里有多只手或多张脸。`, "在预览下方选择目标，系统会裁切并重新识别。", 109);
    }
    if (poseRejectedCount) {
      addAction("open-palm-retake", "摊平手掌重拍", `${poseRejectedCount} 张手部图片未摊平，掌区被遮挡。`, "五指自然张开，掌心摊平，手腕到指尖完整入镜。", 108, "palm_front");
    }
    if (surfaceRejectedCount) {
      addAction("confirm-palm-surface", "确认掌心或手背", `${surfaceRejectedCount} 张正面手图尚未确认朝向。`, "在样本卡片的“确认角度”中选择掌心正面或手背。", 107);
    }
    if (routeReviewCount) {
      addAction("route-review", "确认分流", `${routeReviewCount} 张图片的手相/面相分流置信不足或候选接近。`, "先在通用入口确认分类，必要时改为另一类。", 96);
    }
    if (noSubjectSamples.length || warningSet.has("主体不明显") || warningSet.has("拍得太远") || warningSet.has("主体偏边")) {
      addAction("subject-rescue", "救主体", "主体框不稳、拍得太远或偏边会让定位漂移。", "裁切主体或靠近重拍，让手掌/脸部居中并占画面主要区域。", 92);
    }
    if (warningSet.has("光线偏暗") || warningSet.has("曝光偏亮") || warningSet.has("对比不足")) {
      addAction("light-rescue", "救光线", "曝光和对比问题会压低线条、气色和边缘置信度。", "先自动增强，仍不稳时换均匀自然光重拍。", 86);
    }
    if (warningSet.has("线条不清")) {
      addAction(
        "line-closeup",
        mode === "palm" ? "补线纹近照" : "补局部近照",
        mode === "palm" ? "掌纹线条不清，主线和细线容易误判。" : "面部局部不清，只能粗看分区。",
        mode === "palm" ? "补拍主线或太阳线/财运纹近照。" : "按待补区域补眉眼、鼻部或口下巴近照。",
        82,
        mode === "palm" ? "palm_main_detail" : "eyes"
      );
    }
    if (mixedTypeSamples.length) {
      addAction("type-review", "修正角度", `${mixedTypeSamples.length} 张图片暂归为其他类型，区域矩阵无法直接使用。`, "在样本卡片中改成最接近的掌心、掌侧、正脸、侧脸或局部类型。", 78);
    }
    const nextTask = readinessNextTask(mode, checklist);
    if (nextTask && nextTask.action) {
      addAction("next-shot", "按清单补拍", nextTask.reason || `${nextTask.label || "关键区域"}仍待补图。`, nextTask.action, 72, nextTask.sampleType || null);
    }
    const readyRegions = Array.isArray(matrix) ? matrix.filter((item) => item.status === "ready").length : 0;
    if (modeAnalysisSamples(sampleList).length && !readyRegions) {
      addAction("manual-region-confirm", "人工确认可见区", "还没有区域达到可判断状态。", "先确认确实可见的线纹或面部分区，再决定补哪张图。", 70);
    }
    const sortedActions = actions.sort((a, b) => b.priority - a.priority).slice(0, 5);
    let status = "usable";
    if (noTargetSamples.length > 0 && noTargetSamples.length === sampleList.length && Number(coverage && coverage.sampleCount || 0) === 0) status = "no_target";
    else if (modeMismatchSamples.length && Number(coverage && coverage.sampleCount || 0) === 0) status = "wrong_mode";
    else if (poseRejectedCount && Number(coverage && coverage.sampleCount || 0) === 0) status = "needs_retake";
    else if (!sampleList.length) status = "waiting";
    else if (maxQuality < 0.28 || noSubjectSamples.length === sampleList.length) status = "needs_retake";
    else if (routeReviewCount || !readyRegions) status = "manual_review";
    else if (readiness && readiness.status === "ready" && !sortedActions.some((item) => item.priority >= 82)) status = "usable";
    else status = "recoverable";
    return {
      mode,
      status,
      statusLabel: recognitionFallbackStatusLabel(status),
      score: roundMetric(clamp((readiness ? readiness.score || 0 : 0) + (status === "usable" ? 0.1 : 0) - sortedActions.length * 0.035, 0, 1)),
      sampleCount: sampleList.length,
      maxQuality: roundMetric(maxQuality),
      canProceed: ["usable", "recoverable", "manual_review"].includes(status),
      primaryAction: sortedActions[0] || null,
      actions: sortedActions,
      reviewFlags: {
        warnings: Array.from(warningSet),
        routeReviewCount,
        lowQualityCount: lowQualitySamples.length,
        noSubjectCount: noSubjectSamples.length,
        mixedTypeCount: mixedTypeSamples.length,
        modeMismatchCount: modeMismatchSamples.length,
        noTargetCount: noTargetSamples.length,
        captureRejectedCount
      },
      weakSamples: sampleList
        .filter((sample) => Number(sample.quality || 0) < 0.52 || (sample.warnings || []).length || sample.type === "mixed")
        .slice(0, 5)
        .map((sample) => ({
          name: sample.name,
          type: sample.type,
          label: sample.label || sampleTypeLabel(mode, sample.type),
          quality: sample.quality,
          warnings: sample.warnings || []
        })),
      generatedAt: new Date().toISOString()
    };
  }

  function recognitionFallbackStatusLabel(status) {
    if (status === "usable") return "可继续识别";
    if (status === "recoverable") return "可救图识别";
    if (status === "manual_review") return "需人工复核";
    if (status === "needs_retake") return "建议重拍";
    if (status === "wrong_mode") return "类别不符";
    if (status === "no_target") return "未识别到手或脸";
    return "等待图片";
  }

  function recognitionFallbackBlock(plan) {
    if (!plan) return "";
    const tone = plan.status === "usable"
      ? "green"
      : plan.status === "recoverable"
        ? "gold"
        : plan.status === "waiting"
          ? ""
          : "red";
    const actionText = plan.primaryAction
      ? `${plan.primaryAction.label}：${plan.primaryAction.action}`
      : "当前没有额外兜底动作。";
    const flagTags = [
      plan.reviewFlags.modeMismatchCount ? `<span class="tag red">类别不符 ${plan.reviewFlags.modeMismatchCount}</span>` : "",
      plan.reviewFlags.noTargetCount ? `<span class="tag red">无可分析目标 ${plan.reviewFlags.noTargetCount}</span>` : "",
      plan.reviewFlags.routeReviewCount ? `<span class="tag red">分流复核 ${plan.reviewFlags.routeReviewCount}</span>` : "",
      plan.reviewFlags.lowQualityCount ? `<span class="tag red">低质图 ${plan.reviewFlags.lowQualityCount}</span>` : "",
      plan.reviewFlags.noSubjectCount ? `<span class="tag red">主体不稳 ${plan.reviewFlags.noSubjectCount}</span>` : "",
      plan.reviewFlags.mixedTypeCount ? `<span class="tag gold">角度不明 ${plan.reviewFlags.mixedTypeCount}</span>` : "",
      plan.canProceed
        ? `<span class="tag green">保留识别路径</span>`
        : plan.status === "waiting"
          ? `<span class="tag gold">先上传</span>`
          : plan.status === "no_target"
            ? `<span class="tag red">先换照片</span>`
          : plan.status === "wrong_mode"
            ? `<span class="tag red">先切换入口</span>`
            : `<span class="tag red">先重拍</span>`
    ].filter(Boolean).join("");
    const actions = plan.actions.length
      ? plan.actions.slice(0, 3).map((item) => `<div class="case-meta">${escapeHtml(item.reason)} → ${escapeHtml(item.action)}</div>`).join("")
      : "";
    return `
      <div class="mini-block">
        <p><b>识别兜底方案 ${percent(plan.score)}</b>：<span class="tag ${tone}">${escapeHtml(plan.statusLabel)}</span> ${escapeHtml(actionText)}</p>
        <div class="tag-row">${flagTags}</div>
        ${actions}
      </div>
    `;
  }

  function diagnosticsBlock(samples) {
    if (!samples.length) return "";
    const warnings = samples.flatMap((sample) => sample.warnings);
    const warningText = warnings.length
      ? Array.from(new Set(warnings)).join("、")
      : "暂无明显拍摄风险";
    const suggestions = samples
      .map((sample) => sampleTypeLabel(sample.type.startsWith("face_") || ["forehead", "eyes", "nose", "mouth_jaw"].includes(sample.type) ? "face" : "palm", sample.suggestedType))
      .filter(Boolean);
    const suggestionText = Array.from(new Set(suggestions)).join("、") || "未形成建议";
    const handOrientations = samples
      .map((sample) => sample.handOrientation || (sample.metrics ? sample.metrics.handOrientation : null))
      .filter((item) => item && item.side && item.side !== "unknown")
      .map(handOrientationTag);
    const handText = handOrientations.length ? `；左右候选 ${Array.from(new Set(handOrientations)).join("、")}` : "";
    const faceOrientations = samples
      .map((sample) => sample.faceOrientation || (sample.metrics ? sample.metrics.faceOrientation : null))
      .filter((item) => item && item.pose && item.pose !== "unknown")
      .map(faceOrientationTag);
    const faceText = faceOrientations.length ? `；面部朝向 ${Array.from(new Set(faceOrientations)).join("、")}` : "";
    const rotatedSamples = samples
      .filter((sample) => Array.isArray(sample.rotationCorrections) && sample.rotationCorrections.length)
      .map((sample) => rotationDegreesLabel(sample.rotation || 0));
    const rotationText = rotatedSamples.length ? `；旋转校正 ${rotatedSamples.length} 张（${Array.from(new Set(rotatedSamples)).join("、")}）` : "";
    const preprocessCount = samples.filter((sample) => Array.isArray(sample.preprocessCorrections) && sample.preprocessCorrections.length).length;
    const preprocessText = preprocessCount ? `；图片预处理 ${preprocessCount} 张` : "";
    const nativeSamples = samples.filter((sample) => sample && sample.modelResult && sample.modelResult.nativeVision && sample.modelResult.nativeVision.detected);
    const nativePointCount = nativeSamples.reduce((sum, sample) => sum + Number(sample.modelResult.nativeVision.pointCount || 0), 0);
    const nativeCreaseCount = nativeSamples.reduce((sum, sample) => {
      const candidates = sample && sample.modelResult && Array.isArray(sample.modelResult.creaseCandidates)
        ? sample.modelResult.creaseCandidates
        : [];
      return sum + candidates.length;
    }, 0);
    const nativeCenterlineCount = nativeSamples.reduce((sum, sample) => {
      const candidates = sample && sample.modelResult && Array.isArray(sample.modelResult.creaseCenterlines)
        ? sample.modelResult.creaseCenterlines
        : [];
      return sum + candidates.length;
    }, 0);
    const nativePolylineCount = nativeSamples.reduce((sum, sample) => {
      const candidates = sample && sample.modelResult && Array.isArray(sample.modelResult.creasePolylines)
        ? sample.modelResult.creasePolylines
        : [];
      return sum + candidates.length;
    }, 0);
    const visibleCreaseCount = nativeSamples.reduce((sum, sample) => {
      const candidates = sample && sample.modelResult && Array.isArray(sample.modelResult.creaseCandidates)
        ? sample.modelResult.creaseCandidates
        : [];
      return sum + candidates.filter((item) => Number(item.confidence || 0) >= 0.48).length;
    }, 0);
    const nativeFallbackCount = samples.filter((sample) => sample && sample.modelResult && sample.modelResult.nativeVision && sample.modelResult.nativeVision.fallbackUsed).length;
    const faceCaptureQualities = samples.map(faceCaptureQualityForSample).filter(Boolean);
    const faceCaptureQualityText = faceCaptureQualities.length
      ? `；原生照片可测质量 ${faceCaptureQualities.map((item) => percent(item.score)).join("、")}（门槛 ${percent(faceProportionThresholds.minimumNativeFaceCaptureQuality)}）`
      : "";
    const multiSubjectSamples = samples.filter((sample) => sample && sample.modelResult && Array.isArray(sample.modelResult.subjectCandidates) && sample.modelResult.subjectCandidates.length > 1);
    const multiSubjectText = multiSubjectSamples.length
      ? `；多主体待复核 ${multiSubjectSamples.length} 张，需先用主体裁切确认目标`
      : "";
    const manuallySelectedSamples = samples.filter((sample) => sample && sample.subjectSelection && String(sample.subjectSelection.status || "").startsWith("manual_selected"));
    const manualSubjectText = manuallySelectedSamples.length
      ? `；已人工选择并留痕 ${manuallySelectedSamples.length} 张`
      : "";
    const nativeText = nativeSamples.length
      ? `；原生关键点 ${nativeSamples.length} 张 / ${nativePointCount} 点${faceCaptureQualityText}${nativeCreaseCount ? `；边缘片段 ${nativeCreaseCount} 条（较清晰 ${visibleCreaseCount} 条）` : ""}${nativeCenterlineCount ? `；未分类中心线 ${nativeCenterlineCount} 条` : ""}${nativePolylineCount ? `；待复核拼接长线 ${nativePolylineCount} 条` : ""}${multiSubjectText}${manualSubjectText}`
      : nativeFallbackCount
        ? `；原生未检出 ${nativeFallbackCount} 张，已安全降级`
        : `${multiSubjectText}${manualSubjectText}`;
    return `
      <div class="mini-block">
        <p><b>自动识别诊断</b>：系统建议角度 ${suggestionText}${handText}${faceText}${rotationText}${preprocessText}${nativeText}；拍摄风险 ${warningText}。</p>
      </div>
    `;
  }

  function creaseSemanticCatalogForSample(sample) {
    const type = sample && sample.type || "";
    return palmCreaseSemanticCatalog.filter((item) => item.allowedTypes.includes(type));
  }

  function creaseSemanticReviewControls(sample, polyline) {
    return palmSemanticRuntime.controls(sample,polyline,normalizeCreaseSemanticReview(polyline),creaseSemanticCatalogForSample(sample));
  }

  function creaseCandidateEvidenceBlock(samples) {
    const detectedSamples = (Array.isArray(samples) ? samples : []).filter((sample) => {
      const result = sample && sample.modelResult;
      return result && result.creaseDetection && result.creaseDetection.attempted;
    });
    if (!detectedSamples.length) return "";
    const edgeCandidates = detectedSamples.flatMap((sample) => Array.isArray(sample.modelResult.creaseCandidates)
      ? sample.modelResult.creaseCandidates
      : []);
    const centerlines = detectedSamples.flatMap((sample) => Array.isArray(sample.modelResult.creaseCenterlines)
      ? sample.modelResult.creaseCenterlines
      : []);
    const polylines = detectedSamples.flatMap((sample) => Array.isArray(sample.modelResult.creasePolylines)
      ? sample.modelResult.creasePolylines
      : []);
    const candidates = centerlines.length ? centerlines : edgeCandidates;
    const visible = candidates.filter((item) => Number(item.confidence || 0) >= 0.48);
    const strongest = candidates.slice().sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0];
    const orientationLabels = {
      transverse: "横向",
      longitudinal: "纵向",
      oblique: "斜向",
      curved: "弧形"
    };
    const directionText = Array.from(new Set(candidates.map((item) => orientationLabels[item.orientation]).filter(Boolean))).join("、") || "未稳定";
    const strongestText = strongest
      ? `最高片段置信 ${percent(Number(strongest.confidence || 0))}，方向 ${orientationLabels[strongest.orientation] || "未定"}`
      : "当前照片没有达到保留阈值的片段";
    const sampleText = detectedSamples.map((sample) => {
      const count = Array.isArray(sample.modelResult.creaseCandidates) ? sample.modelResult.creaseCandidates.length : 0;
      const centerlineCount = Array.isArray(sample.modelResult.creaseCenterlines) ? sample.modelResult.creaseCenterlines.length : 0;
      const polylineCount = Array.isArray(sample.modelResult.creasePolylines) ? sample.modelResult.creasePolylines.length : 0;
      return `${sample.label || sample.name || "掌照"} 边缘 ${count} / 中心线 ${centerlineCount} / 拼接长线 ${polylineCount} 条`;
    }).join("；");
    const reviewItems = detectedSamples.slice(-3).reverse().flatMap((sample) => {
      const items = Array.isArray(sample.modelResult.creasePolylines) ? sample.modelResult.creasePolylines : [];
      return items.map((item) => ({ sample, item }));
    }).slice(0, 12);
    const acceptedCount = polylines.filter((item) => item.reviewStatus === "accepted").length;
    const rejectedCount = polylines.filter((item) => item.reviewStatus === "rejected").length;
    const semanticConfirmedCount = polylines.filter((item) => normalizeCreaseSemanticReview(item).status === "confirmed").length;
    const reviewRows = reviewItems.map(({ sample, item }) => {
      const status = ["accepted", "rejected"].includes(item.reviewStatus) ? item.reviewStatus : "pending";
      const statusLabel = status === "accepted" ? "已接受几何" : status === "rejected" ? "已拒绝" : "待复核";
      const statusClass = status === "accepted" ? "green" : status === "rejected" ? "red" : "gold";
      const segmentCount = Math.max(1, Number(item.segmentCount || 1));
      const geometryLabel = item.stitchStatus === "manual_split" ? "人工拆分段" : item.stitchStatus === "manual_reconnect" ? "人工重连线" : item.stitchStatus === "standalone" ? "原生单段长线" : `${segmentCount}段拼接`;
      const splitOptions = creaseSplitPointOptions(item);
      const reconnectIndex = state.creaseReconnectSelection.findIndex((entry) => entry.sampleId === sample.id && entry.polylineKey === item.key);
      return `
        <div class="crease-review-row">
          <div>
            <strong>${escapeHtml(sample.label || sample.name || "掌照")} · ${escapeHtml(item.key || "拼接长线")}</strong>
            <span class="tag ${statusClass}">${statusLabel}</span>
            <p class="muted">${escapeHtml(geometryLabel)}；长度 ${Number(item.lengthPalmUnits || 0).toFixed(2)} 掌区单位；拼接置信 ${percent(Number(item.averageJoinScore || 0))}。接受只确认几何连续，不确认掌纹名称。</p>
          </div>
          <div class="crease-review-actions">
            <button type="button" class="secondary-action compact-action" data-crease-polyline-review="accepted" data-crease-sample-id="${escapeHtml(sample.id || "")}" data-crease-polyline-key="${escapeHtml(item.key || "")}" aria-pressed="${status === "accepted"}">接受几何</button>
            <button type="button" class="secondary-action compact-action" data-crease-polyline-review="rejected" data-crease-sample-id="${escapeHtml(sample.id || "")}" data-crease-polyline-key="${escapeHtml(item.key || "")}" aria-pressed="${status === "rejected"}">拒绝拼接</button>
            ${splitOptions.length && status !== "rejected" ? `
              <label class="crease-split-control">
                <span>拆分点</span>
                <select data-crease-split-point>${splitOptions.map((option) => `<option value="${option.index}"${option.default ? " selected" : ""}>${option.label}</option>`).join("")}</select>
              </label>
              <button type="button" class="secondary-action compact-action" data-crease-split data-crease-sample-id="${escapeHtml(sample.id || "")}" data-crease-polyline-key="${escapeHtml(item.key || "")}">拆分</button>
            ` : ""}
            ${status !== "rejected" ? `<button type="button" class="secondary-action compact-action" data-crease-reconnect-select data-crease-sample-id="${escapeHtml(sample.id || "")}" data-crease-polyline-key="${escapeHtml(item.key || "")}" aria-pressed="${reconnectIndex >= 0}">${reconnectIndex >= 0 ? `重连${reconnectIndex + 1}` : "选入重连"}</button>` : ""}
          </div>
          ${creaseSemanticReviewControls(sample, item)}
        </div>
      `;
    }).join("");
    const reconnectSelection = state.creaseReconnectSelection;
    const reconnectReady = reconnectSelection.length === 2 && reconnectSelection[0].sampleId === reconnectSelection[1].sampleId;
    const undoSample = detectedSamples.slice().reverse().find((sample) => latestActiveCreaseEdit(sample));
    const editorText = reconnectSelection.length
      ? `已选择 ${reconnectSelection.length}/2 条${reconnectReady ? "，可以重连" : ""}`
      : "先在同一张掌照中选择两条未拒绝的线";
    const calibration = creaseStitchCalibrationProfile();
    return `
      <div class="mini-block">
        <p><b>真实掌褶几何证据</b>：${escapeHtml(sampleText)}；当前优先统计 ${centerlines.length ? "中心线" : "边缘片段"} ${candidates.length} 条，其中较清晰 ${visible.length} 条。${escapeHtml(strongestText)}。</p>
        <p class="muted">候选方向：${escapeHtml(directionText)}。中心线由掌区局部对比、双阈值连通和骨架化得到；拼接长线还额外要求端点距离、切线方向和间隙暗纹连续。当前已接受 ${acceptedCount} 条、拒绝 ${rejectedCount} 条、完成二阶段传统名称确认 ${semanticConfirmedCount} 条；未经“接受几何、初标、复核确认”三道门槛的线不得获得生命线、智慧线、感情线、太阳线、财运纹或贵人线名称。</p>
        ${creaseStitchCalibrationBlock(calibration)}
        ${reviewRows ? `<details class="crease-review-details"${state.creaseReconnectSelection.length || state.creaseEditorNotice ? " open" : ""}><summary>复核与编辑拼接长线（${reviewItems.length}）</summary>
          <div class="crease-editor-toolbar">
            <span>${escapeHtml(editorText)}</span>
            <button type="button" class="secondary-action compact-action" data-crease-reconnect-run${reconnectReady ? "" : " disabled"}>重连所选</button>
            <button type="button" class="secondary-action compact-action" data-crease-reconnect-clear${reconnectSelection.length ? "" : " disabled"}>清除选择</button>
            ${undoSample ? `<button type="button" class="secondary-action compact-action" data-crease-edit-undo data-crease-sample-id="${escapeHtml(undoSample.id || "")}">撤销最近编辑</button>` : ""}
          </div>
          ${state.creaseEditorNotice ? `<div class="case-meta crease-editor-notice">${escapeHtml(state.creaseEditorNotice)}</div>` : ""}
          <div class="crease-review-list">${reviewRows}</div>
        </details>` : ""}
      </div>
    `;
  }

  function creaseSplitPointOptions(polyline) {
    const points = polyline && Array.isArray(polyline.points) ? polyline.points : [];
    if (points.length < 6) return [];
    const minimumSidePoints = 3;
    const candidates = [0.25, 0.5, 0.75]
      .map((ratio) => Math.round((points.length - 1) * ratio))
      .filter((index) => index >= minimumSidePoints - 1 && points.length - index >= minimumSidePoints);
    const indexes = Array.from(new Set(candidates));
    return indexes.map((index) => ({
      index,
      label: `${Math.round(index / (points.length - 1) * 100)}%`,
      default: Math.abs(index / (points.length - 1) - 0.5) === Math.min(...indexes.map((item) => Math.abs(item / (points.length - 1) - 0.5)))
    }));
  }

  function nextCreaseOperationId(operation) {
    state.caseIdSequence += 1;
    return `${operation}-${Date.now()}-${state.caseIdSequence}`;
  }

  function normalizedPolylineLength(points) {
    return (Array.isArray(points) ? points : []).slice(1).reduce((total, point, index) => {
      const previous = points[index];
      return total + Math.hypot(Number(point.x) - Number(previous.x), Number(point.y) - Number(previous.y));
    }, 0);
  }

  function boundedPolylinePoints(points, maximum = 48) {
    const valid = (Array.isArray(points) ? points : [])
      .filter((point) => point && isUnitCoordinate(point.x) && isUnitCoordinate(point.y))
      .map((point) => ({ x: roundMetric(point.x), y: roundMetric(point.y) }));
    if (valid.length <= maximum) return valid;
    const sampled = [];
    for (let index = 0; index < maximum; index += 1) {
      sampled.push(valid[Math.round(index * (valid.length - 1) / (maximum - 1))]);
    }
    return sampled;
  }

  function polylineBoundsFromPoints(points) {
    const xs = points.map((point) => Number(point.x));
    const ys = points.map((point) => Number(point.y));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: roundMetric(minX),
      y: roundMetric(minY),
      width: roundMetric(maxX - minX),
      height: roundMetric(maxY - minY)
    };
  }

  function polylineOrientationFromPoints(points) {
    const bounds = polylineBoundsFromPoints(points);
    const length = normalizedPolylineLength(points);
    const first = points[0];
    const last = points[points.length - 1];
    const chord = Math.hypot(last.x - first.x, last.y - first.y);
    if (length > Math.max(chord, 0.02) * 1.38) return "curved";
    if (bounds.width > bounds.height * 1.4) return "transverse";
    if (bounds.height > bounds.width * 1.4) return "longitudinal";
    return "oblique";
  }

  function manualSplitPolyline(parent, points, key, operationId) {
    const parentPathLength = Math.max(normalizedPolylineLength(parent.points), 0.000001);
    const piecePathLength = normalizedPolylineLength(points);
    const sourceLength = Number(parent.lengthPalmUnits || 0);
    return {
      ...parent,
      key,
      label: "人工拆分掌褶段",
      points: boundedPolylinePoints(points),
      bounds: polylineBoundsFromPoints(points),
      orientation: polylineOrientationFromPoints(points),
      lengthPalmUnits: roundMetric(sourceLength ? sourceLength * piecePathLength / parentPathLength : piecePathLength),
      segmentCount: 1,
      segmentKeys: [],
      sourceSegmentKeys: Array.isArray(parent.segmentKeys) ? parent.segmentKeys.slice(0, 8) : [],
      joinCount: 0,
      maximumJoinGapPalmUnits: 0,
      sourcePolylineKeys: [parent.key],
      parentKey: parent.key,
      manualOperationId: operationId,
      source: "manual_polyline_split",
      geometry: "manual_polyline_fragment",
      stitchStatus: "manual_split",
      reviewStatus: "accepted",
      reviewedAt: new Date().toISOString(),
      reviewSource: "manual_polyline_split",
      semanticKey: null,
      semanticStatus: "unclassified",
      reviewRequired: true,
      namingAllowed: false
    };
  }

  function recordCreaseGeometryEdit(sample, edit) {
    if (!Array.isArray(sample.creaseGeometryEdits)) sample.creaseGeometryEdits = [];
    sample.creaseGeometryEdits.push({
      ...edit,
      source: edit.operation === "split" ? "manual_polyline_split" : "manual_polyline_reconnect",
      correctedAt: new Date().toISOString(),
      sampleId: sample.id,
      sampleName: sample.name,
      modelVersion: sample.modelVersion,
      reviewStatus: "accepted",
      semanticStatus: "unclassified",
      namingAllowed: false
    });
    sample.creaseGeometryEdits = sample.creaseGeometryEdits.slice(-16);
  }

  function latestActiveCreaseEdit(sample) {
    const edits = sample && Array.isArray(sample.creaseGeometryEdits) ? sample.creaseGeometryEdits : [];
    return edits.slice().reverse().find((edit) => edit && !edit.undoneAt) || null;
  }

  function refreshCreaseGeometryState(sample, notice) {
    state.creaseReconnectSelection = [];
    state.creaseEditorNotice = notice || "";
    if (sample && sample.modelResult && sample.modelResult.creaseDetection) {
      const count = Array.isArray(sample.modelResult.creasePolylines) ? sample.modelResult.creasePolylines.length : 0;
      sample.modelResult.creaseDetection.polylineCount = count;
      if (sample.modelResult.creaseDetection.centerlineDetection) {
        sample.modelResult.creaseDetection.centerlineDetection.polylineCount = count;
      }
    }
    invalidateDerivedData();
    const latest = latestSampleForMode("palm");
    if (sample && latest && sample.id === latest.id) {
      redrawPreviewForSample("palm", sample, sample.modelResult);
      renderOverlaySummary("palm", sample);
      renderModelDebug(sample);
    }
    renderGeometryTrainingPanel();
    renderPalmReport();
  }

  function splitCreasePolyline(sampleId, polylineKey, pointIndex) {
    const sample = state.palmSamples.find((item) => item && item.id === sampleId);
    const polylines = sample && sample.modelResult && Array.isArray(sample.modelResult.creasePolylines)
      ? sample.modelResult.creasePolylines
      : [];
    const polylineIndex = polylines.findIndex((item) => item && item.key === polylineKey);
    const parent = polylines[polylineIndex];
    if (!parent || parent.reviewStatus === "rejected") return false;
    if (polylines.length >= 8) {
      refreshCreaseGeometryState(sample, "当前已经有8条长线，先重连或撤销一条再拆分。");
      return false;
    }
    const allowedIndexes = new Set(creaseSplitPointOptions(parent).map((item) => item.index));
    if (!Number.isInteger(pointIndex) || !allowedIndexes.has(pointIndex)) return false;
    const leftPoints = parent.points.slice(0, pointIndex + 1);
    const rightPoints = parent.points.slice(pointIndex);
    if (leftPoints.length < 3 || rightPoints.length < 3) return false;
    storeOriginalModelGeometry(sample);
    const operationId = nextCreaseOperationId("split");
    const left = manualSplitPolyline(parent, leftPoints, `crease_manual_${operationId}_a`, operationId);
    const right = manualSplitPolyline(parent, rightPoints, `crease_manual_${operationId}_b`, operationId);
    polylines.splice(polylineIndex, 1, left, right);
    recordCreaseGeometryEdit(sample, {
      id: operationId,
      operation: "split",
      splitPointIndex: pointIndex,
      beforeEntries: [{ index: polylineIndex, polyline: deepClone(parent) }],
      beforeKeys: [parent.key],
      afterKeys: [left.key, right.key]
    });
    refreshCreaseGeometryState(sample, `已在约${Math.round(pointIndex / (parent.points.length - 1) * 100)}%位置拆成两段；两段仍保持未分类。`);
    return true;
  }

  function toggleCreaseReconnectSelection(sampleId, polylineKey) {
    const sample = state.palmSamples.find((item) => item && item.id === sampleId);
    const polyline = sample && sample.modelResult && Array.isArray(sample.modelResult.creasePolylines)
      ? sample.modelResult.creasePolylines.find((item) => item && item.key === polylineKey)
      : null;
    if (!polyline || polyline.reviewStatus === "rejected") return false;
    const existingIndex = state.creaseReconnectSelection.findIndex((item) => item.sampleId === sampleId && item.polylineKey === polylineKey);
    if (existingIndex >= 0) {
      state.creaseReconnectSelection.splice(existingIndex, 1);
    } else {
      if (state.creaseReconnectSelection.some((item) => item.sampleId !== sampleId) || state.creaseReconnectSelection.length >= 2) {
        state.creaseReconnectSelection = [];
      }
      state.creaseReconnectSelection.push({ sampleId, polylineKey });
    }
    state.creaseEditorNotice = state.creaseReconnectSelection.length === 2 ? "两条线已选好，请点击“重连所选”。" : "";
    renderPalmReport();
    return true;
  }

  function clearCreaseReconnectSelection() {
    state.creaseReconnectSelection = [];
    state.creaseEditorNotice = "已清除重连选择。";
    renderPalmReport();
  }

  function endpointDirection(points, atStart) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const offset = Math.min(3, points.length - 1);
    const first = atStart ? points[0] : points[points.length - 1 - offset];
    const second = atStart ? points[offset] : points[points.length - 1];
    const dx = Number(second.x) - Number(first.x);
    const dy = Number(second.y) - Number(first.y);
    const length = Math.hypot(dx, dy);
    return length > 0.000001 ? { x: dx / length, y: dy / length } : null;
  }

  function bestManualPolylineJoin(first, second) {
    let best = null;
    for (const reverseFirst of [false, true]) {
      const left = reverseFirst ? first.points.slice().reverse() : first.points.slice();
      for (const reverseSecond of [false, true]) {
        const right = reverseSecond ? second.points.slice().reverse() : second.points.slice();
        const leftEnd = left[left.length - 1];
        const rightStart = right[0];
        const gap = Math.hypot(rightStart.x - leftEnd.x, rightStart.y - leftEnd.y);
        const leftDirection = endpointDirection(left, false);
        const rightDirection = endpointDirection(right, true);
        const alignment = leftDirection && rightDirection
          ? leftDirection.x * rightDirection.x + leftDirection.y * rightDirection.y
          : 0;
        const cost = gap + (1 - clamp((alignment + 1) / 2, 0, 1)) * 0.04;
        if (!best || cost < best.cost) best = { left, right, gap, alignment, cost };
      }
    }
    return best;
  }

  function manualReconnectPolyline(first, second, join, key, operationId) {
    const leftEnd = join.left[join.left.length - 1];
    const rightStart = join.right[0];
    const bridge = join.gap > 0.012
      ? [1 / 3, 2 / 3].map((ratio) => ({
          x: roundMetric(leftEnd.x + (rightStart.x - leftEnd.x) * ratio),
          y: roundMetric(leftEnd.y + (rightStart.y - leftEnd.y) * ratio)
        }))
      : [];
    const points = boundedPolylinePoints([...join.left, ...bridge, ...join.right]);
    const existingJoinCount = Number(first.joinCount || 0) + Number(second.joinCount || 0);
    const totalJoinCount = existingJoinCount + 1;
    const existingJoinScore = Number(first.averageJoinScore || 0) * Number(first.joinCount || 0)
      + Number(second.averageJoinScore || 0) * Number(second.joinCount || 0);
    const manualJoinScore = clamp((1 - join.gap / 0.14) * 0.55 + clamp((join.alignment + 1) / 2, 0, 1) * 0.45, 0, 1);
    const averageJoinScore = (existingJoinScore + manualJoinScore) / totalJoinCount;
    return {
      key,
      label: "人工重连掌褶长线",
      points,
      bounds: polylineBoundsFromPoints(points),
      confidence: roundMetric(clamp((Number(first.confidence || 0) + Number(second.confidence || 0)) / 2 * 0.96, 0.26, 0.72)),
      visibility: "manual_reviewed",
      orientation: polylineOrientationFromPoints(points),
      lengthPalmUnits: roundMetric(Number(first.lengthPalmUnits || 0) + Number(second.lengthPalmUnits || 0)),
      segmentCount: Math.min(8, Number(first.segmentCount || 1) + Number(second.segmentCount || 1)),
      segmentKeys: Array.from(new Set([...(first.segmentKeys || []), ...(second.segmentKeys || [])])).slice(0, 8),
      sourcePolylineKeys: [first.key, second.key],
      joinCount: totalJoinCount,
      manualJoinGapNormalized: roundMetric(join.gap),
      manualJoinTangentAlignment: roundMetric(join.alignment),
      averageJoinScore: roundMetric(averageJoinScore),
      manualOperationId: operationId,
      source: "manual_polyline_reconnect",
      geometry: "manual_reconnected_polyline",
      stitchStatus: "manual_reconnect",
      reviewStatus: "accepted",
      reviewedAt: new Date().toISOString(),
      reviewSource: "manual_polyline_reconnect",
      semanticKey: null,
      semanticStatus: "unclassified",
      reviewRequired: true,
      namingAllowed: false
    };
  }

  function reconnectSelectedCreasePolylines() {
    const selection = state.creaseReconnectSelection;
    if (selection.length !== 2 || selection[0].sampleId !== selection[1].sampleId) return false;
    const sample = state.palmSamples.find((item) => item && item.id === selection[0].sampleId);
    const polylines = sample && sample.modelResult && Array.isArray(sample.modelResult.creasePolylines)
      ? sample.modelResult.creasePolylines
      : [];
    const firstIndex = polylines.findIndex((item) => item && item.key === selection[0].polylineKey);
    const secondIndex = polylines.findIndex((item) => item && item.key === selection[1].polylineKey);
    if (firstIndex < 0 || secondIndex < 0 || firstIndex === secondIndex) return false;
    const first = polylines[firstIndex];
    const second = polylines[secondIndex];
    const join = bestManualPolylineJoin(first, second);
    if (!join || join.gap > 0.14 || join.alignment < -0.25) {
      state.creaseEditorNotice = "两条线的最近端点仍过远或方向相反，未执行重连；请先调整控制点。";
      renderPalmReport();
      return false;
    }
    storeOriginalModelGeometry(sample);
    const operationId = nextCreaseOperationId("reconnect");
    const merged = manualReconnectPolyline(first, second, join, `crease_manual_${operationId}`, operationId);
    const beforeEntries = [
      { index: firstIndex, polyline: deepClone(first) },
      { index: secondIndex, polyline: deepClone(second) }
    ].sort((a, b) => a.index - b.index);
    const insertIndex = Math.min(firstIndex, secondIndex);
    const removeIndexes = new Set([firstIndex, secondIndex]);
    const remaining = polylines.filter((item, index) => !removeIndexes.has(index));
    remaining.splice(insertIndex, 0, merged);
    sample.modelResult.creasePolylines = remaining;
    recordCreaseGeometryEdit(sample, {
      id: operationId,
      operation: "reconnect",
      beforeEntries,
      beforeKeys: [first.key, second.key],
      afterKeys: [merged.key],
      metrics: {
        gapNormalized: roundMetric(join.gap),
        tangentAlignment: roundMetric(join.alignment),
        manualJoinScore: roundMetric(merged.averageJoinScore)
      }
    });
    refreshCreaseGeometryState(sample, `已重连两条线；端点间距${roundMetric(join.gap)}，方向一致度${roundMetric(join.alignment)}，仍保持未分类。`);
    return true;
  }

  function undoLastCreaseGeometryEdit(sampleId) {
    const sample = state.palmSamples.find((item) => item && item.id === sampleId);
    const edit = latestActiveCreaseEdit(sample);
    if (!sample || !edit || !sample.modelResult || !Array.isArray(sample.modelResult.creasePolylines)) return false;
    const afterKeys = new Set(edit.afterKeys || []);
    const restored = sample.modelResult.creasePolylines.filter((item) => !afterKeys.has(item.key));
    (edit.beforeEntries || []).slice().sort((a, b) => a.index - b.index).forEach((entry) => {
      const index = Math.max(0, Math.min(restored.length, Number(entry.index || 0)));
      restored.splice(index, 0, deepClone(entry.polyline));
    });
    sample.modelResult.creasePolylines = restored.slice(0, 8);
    edit.undoneAt = new Date().toISOString();
    refreshCreaseGeometryState(sample, `已撤销最近一次${edit.operation === "split" ? "拆分" : "重连"}。`);
    return true;
  }

  function reviewedCreaseRecord(polyline, outcome, source, id) {
    if (!polyline || polyline.stitchStatus !== "provisional") return null;
    const score = Number(polyline.averageJoinScore);
    const gap = Number(polyline.maximumJoinGapPalmUnits);
    if (!Number.isFinite(score) || !Number.isFinite(gap)) return null;
    return {
      id,
      outcome,
      score,
      gap,
      confidence: Number(polyline.confidence || 0),
      segmentCount: Number(polyline.segmentCount || 0),
      source
    };
  }

  function creaseReviewRecordsFromSamples(samples, source) {
    const records = [];
    (Array.isArray(samples) ? samples : []).forEach((sample) => {
      const polylines = sample && sample.modelResult && Array.isArray(sample.modelResult.creasePolylines)
        ? sample.modelResult.creasePolylines
        : [];
      polylines.forEach((polyline) => {
        if (!["accepted", "rejected"].includes(polyline.reviewStatus)) return;
        const sampleKey = sample.id || sample.name || "sample";
        const record = reviewedCreaseRecord(polyline, polyline.reviewStatus, source, `${sampleKey}|${polyline.key}|${polyline.reviewedAt || "reviewed"}`);
        if (record) records.push(record);
      });
      (sample && Array.isArray(sample.creaseGeometryEdits) ? sample.creaseGeometryEdits : []).forEach((edit) => {
        if (!edit || edit.undoneAt || edit.operation !== "split") return;
        (edit.beforeEntries || []).forEach((entry, index) => {
          const record = reviewedCreaseRecord(entry.polyline, "rejected", `${source}_split`, `${sample.id || sample.name || "sample"}|${edit.id}|${index}`);
          if (record) records.push(record);
        });
      });
    });
    return records;
  }

  function quantile(values, ratio) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * clamp(ratio, 0, 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function creaseStitchCalibrationProfile() {
    if (derivedDataCache.creaseCalibration && derivedDataCache.creaseCalibrationRevision === derivedDataCache.revision) {
      return derivedDataCache.creaseCalibration;
    }
    const caseSamples = state.caseLibrary.flatMap((item) => item && item.payload && item.payload.type === "palm" && Array.isArray(item.payload.samples)
      ? item.payload.samples
      : []);
    const allSamples = [...state.palmSamples, ...caseSamples];
    const records = [...creaseReviewRecordsFromSamples(state.palmSamples, "current_session"), ...creaseReviewRecordsFromSamples(caseSamples, "case_library")];
    const unique = Array.from(new Map(records.map((item) => [item.id, item])).values());
    const accepted = unique.filter((item) => item.outcome === "accepted");
    const rejected = unique.filter((item) => item.outcome === "rejected");
    const ready = state.caseLibraryFullyLoaded && unique.length >= 8 && accepted.length >= 3 && rejected.length >= 3;
    const acceptedScoreFloor = quantile(accepted.map((item) => item.score), 0.2);
    const rejectedScoreCeiling = quantile(rejected.map((item) => item.score), 0.8);
    const acceptedGapCeiling = quantile(accepted.map((item) => item.gap), 0.8);
    const rejectedGapFloor = quantile(rejected.map((item) => item.gap), 0.2);
    const observedThresholds = allSamples.map((sample) => sample && sample.modelResult && sample.modelResult.creaseDetection && sample.modelResult.creaseDetection.centerlineDetection && sample.modelResult.creaseDetection.centerlineDetection.stitchThresholds).find(Boolean) || {};
    const profile = {
      status: ready ? "review_ready" : "collecting",
      libraryComplete: state.caseLibraryFullyLoaded,
      reviewedCount: unique.length,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      currentThresholds: {
        maximumGapPalmUnits: Number(observedThresholds.maximumGapPalmUnits || 0.055),
        minimumJoinScore: Number(observedThresholds.minimumJoinScore || 0.67),
        minimumTangentAlignment: Number(observedThresholds.minimumTangentAlignment || 0.62),
        minimumGapAlignment: Number(observedThresholds.minimumGapAlignment || 0.42),
        minimumContrastFraction: Number(observedThresholds.minimumContrastFraction || 0.43),
        minimumContrastMean: Number(observedThresholds.minimumContrastMean || 2.1)
      },
      observed: {
        acceptedScoreMedian: quantile(accepted.map((item) => item.score), 0.5),
        rejectedScoreMedian: quantile(rejected.map((item) => item.score), 0.5),
        acceptedGapMedian: quantile(accepted.map((item) => item.gap), 0.5),
        rejectedGapMedian: quantile(rejected.map((item) => item.gap), 0.5)
      },
      suggestedThresholds: ready ? {
        minimumJoinScore: acceptedScoreFloor !== null && rejectedScoreCeiling !== null
          ? roundMetric(clamp((acceptedScoreFloor + rejectedScoreCeiling) / 2, 0.62, 0.84))
          : 0.67,
        maximumGapPalmUnits: acceptedGapCeiling !== null && rejectedGapFloor !== null
          ? roundMetric(clamp((acceptedGapCeiling + rejectedGapFloor) / 2, 0.018, 0.055))
          : 0.055
      } : null,
      appliesAutomatically: false,
      minimumReviewGate: { total: 8, accepted: 3, rejected: 3 },
      boundaries: ["reviewed_native_provisional_polylines_only", "suggestion_only", "no_semantic_naming"]
    };
    derivedDataCache.creaseCalibration = profile;
    derivedDataCache.creaseCalibrationRevision = derivedDataCache.revision;
    return profile;
  }

  function creaseStitchCalibrationBlock(profile) {
    if (!profile || !profile.reviewedCount) {
      return `<div class="case-meta">拼接阈值校准：尚无接受/拒绝样本；至少需要8条复核记录，且接受、拒绝各不少于3条。</div>`;
    }
    const statusText = profile.libraryComplete === false
      ? "案例库仍在后台补齐，完整前不生成阈值建议"
      : profile.status === "review_ready"
      ? `已形成候选阈值：最低拼接分 ${profile.suggestedThresholds.minimumJoinScore}，最大间距 ${profile.suggestedThresholds.maximumGapPalmUnits} 掌区单位`
      : "样本仍在积累，暂不建议改动原生阈值";
    return `<div class="case-meta">拼接阈值校准：复核 ${profile.reviewedCount} 条（接受 ${profile.acceptedCount} / 拒绝 ${profile.rejectedCount}）。${escapeHtml(statusText)}；候选阈值不会自动生效。</div>`;
  }

  function setCreasePolylineReview(sampleId, polylineKey, status) {
    if (!["accepted", "rejected"].includes(status)) return false;
    const sample = state.palmSamples.find((item) => item && item.id === sampleId);
    const polylines = sample && sample.modelResult && Array.isArray(sample.modelResult.creasePolylines)
      ? sample.modelResult.creasePolylines
      : [];
    const polyline = polylines.find((item) => item && item.key === polylineKey);
    if (!polyline) return false;
    polyline.reviewStatus = status;
    polyline.reviewedAt = new Date().toISOString();
    polyline.reviewSource = "manual_geometry_review";
    if (status === "rejected") invalidateCreaseSemanticReview(polyline, "geometry_rejected");
    if (status === "rejected") {
      state.creaseReconnectSelection = state.creaseReconnectSelection.filter((item) => !(item.sampleId === sampleId && item.polylineKey === polylineKey));
    }
    state.creaseEditorNotice = status === "accepted" ? "已接受当前几何，仍未命名。" : "已拒绝该拼接，不再提供控制点或重连选择。";
    invalidateDerivedData();
    const latest = latestSampleForMode("palm");
    if (latest && latest.id === sample.id) {
      redrawPreviewForSample("palm", sample, sample.modelResult);
      renderOverlaySummary("palm", sample);
    }
    renderPalmReport();
    return true;
  }

  function setCreaseSemanticReview(sampleId, polylineKey, semanticKey, action) {
    if (!["propose", "confirm", "clear"].includes(action)) return false;
    const sample = state.palmSamples.find((item) => item && item.id === sampleId);
    const polyline = sample && sample.modelResult && Array.isArray(sample.modelResult.creasePolylines)
      ? sample.modelResult.creasePolylines.find((item) => item && item.key === polylineKey)
      : null;
    if (!sample || !polyline || polyline.reviewStatus !== "accepted") return false;
    const spec = palmCreaseSemanticSpec(semanticKey);
    if (action !== "clear" && (!spec || !spec.allowedTypes.includes(sample.type))) return false;
    if (!applyCreaseSemanticReview(polyline, semanticKey, action)) return false;
    const review = normalizeCreaseSemanticReview(polyline);
    const label = palmCreaseSemanticSpec(review.candidateKey);
    state.creaseEditorNotice = action === "clear"
      ? "已清除传统名称标签，几何复核状态不变。"
      : review.status === "confirmed"
        ? `已二阶段确认${label ? label.label : review.candidateKey}；只进入传统分类训练真值。`
        : `已初标${label ? label.label : review.candidateKey}，请再次复核后确认。`;
    invalidateDerivedData();
    const latest = latestSampleForMode("palm");
    if (latest && latest.id === sample.id) {
      redrawPreviewForSample("palm", sample, sample.modelResult);
      renderOverlaySummary("palm", sample);
      renderModelDebug(sample);
    }
    renderGeometryTrainingPanel();
    renderPalmReport();
    return true;
  }

  function nextShotPlan(mode, coverage, matrix, annotations) {
    const items = new Map();
    (coverage.missing || []).forEach(([type, label]) => {
      addShotPlanItem(items, {
        key: `type:${type}`,
        label,
        sampleType: type,
        action: shotActionForType(mode, type),
        reason: "标准角度未覆盖",
        priority: 2
      });
    });
    (matrix || []).forEach((item) => {
      if (!item || item.status === "ready") return;
      addShotPlanItem(items, {
        key: `region:${item.key}`,
        label: item.label,
        sampleType: shotTypeForRegion(mode, item.key),
        action: shotActionForRegion(mode, item.key),
        reason: item.status === "missing" ? `缺少${item.need}` : `${item.label}仅可粗看`,
        priority: item.status === "missing" ? 4 : 3
      });
    });
    (annotations || []).forEach((item) => {
      if (!item || !["need_more", "unknown", "weak", "asymmetric"].includes(item.status)) return;
      addShotPlanItem(items, {
        key: `annotation:${item.key}`,
        label: item.label,
        sampleType: shotTypeForAnnotation(mode, item.key),
        action: shotActionForAnnotation(mode, item.key),
        reason: `${item.label}${item.status === "need_more" ? "待补图" : "需复核"}`,
        priority: item.status === "need_more" ? 4 : 1
      });
    });
    return Array.from(items.values())
      .sort((a, b) => b.priority - a.priority || String(a.label).localeCompare(String(b.label)))
      .slice(0, 6);
  }

  function shotChecklist(mode, coverage, matrix, annotations = []) {
    const tasks = [];
    const covered = coverage && Array.isArray(coverage.covered) ? coverage.covered : [];
    const missing = coverage && Array.isArray(coverage.missing) ? coverage.missing : [];
    covered.forEach(([type, label]) => {
      tasks.push({
        key: `angle:${type}`,
        group: "标准角度",
        label,
        status: "done",
        statusLabel: "已补齐",
        sampleType: type,
        reason: "标准角度已覆盖",
        action: shotActionForType(mode, type)
      });
    });
    missing.forEach(([type, label]) => {
      tasks.push({
        key: `angle:${type}`,
        group: "标准角度",
        label,
        status: "pending",
        statusLabel: "待补拍",
        sampleType: type,
        reason: "标准角度未覆盖",
        action: shotActionForType(mode, type)
      });
    });
    (matrix || []).forEach((item) => {
      const status = shotTaskStatusFromMatrix(item);
      tasks.push({
        key: `region:${item.key}`,
        group: "可判断区域",
        label: item.label,
        status,
        statusLabel: shotTaskStatusLabel(status),
        sampleType: shotTypeForRegion(mode, item.key),
        reason: `${statusText(item.status)} · ${item.reason}`,
        confidence: item.confidence,
        manualConfirmed: item.manualConfirmed,
        modelConfirmed: item.modelConfirmed,
        action: shotActionForRegion(mode, item.key)
      });
    });
    (annotations || []).forEach((item) => {
      const status = shotTaskStatusFromAnnotation(item);
      tasks.push({
        key: `annotation:${item.key}`,
        group: "细节标注",
        label: item.label,
        status,
        statusLabel: shotTaskStatusLabel(status),
        sampleType: shotTypeForAnnotation(mode, item.key),
        reason: `${annotationStatusLabel(item.status)} · ${annotationStatusNote(item.status)}`,
        source: item.source,
        action: shotActionForAnnotation(mode, item.key)
      });
    });
    const doneCount = tasks.filter((item) => item.status === "done").length;
    const partialCount = tasks.filter((item) => item.status === "partial").length;
    const pendingCount = tasks.filter((item) => item.status === "pending").length;
    const completion = tasks.length ? clamp((doneCount + partialCount * 0.5) / tasks.length, 0, 1) : 0;
    return {
      mode,
      total: tasks.length,
      doneCount,
      partialCount,
      pendingCount,
      completion,
      tasks
    };
  }

  function currentShotChecklist(mode) {
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    const annotations = mode === "palm" ? collectPalmLineAnnotations() : collectFaceZoneAnnotations();
    const coverage = recognitionCoverage(mode, samples);
    const matrix = recognitionMatrix(mode, samples);
    return shotChecklist(mode, coverage, matrix, annotations);
  }

  function prioritySignalsForMode(mode) {
    const samples = mode === "palm" ? state.palmSamples : state.faceSamples;
    const grouped = new Map();
    const addSignal = (signal, sourceName) => {
      if (!signal || !signal.targetType) return;
      const existing = grouped.get(signal.targetType) || {
        targetType: signal.targetType,
        weight: 0,
        reasons: [],
        sources: []
      };
      existing.weight = Math.max(existing.weight, Number(signal.weight || 0));
      if (signal.reason) existing.reasons.push(signal.reason);
      if (sourceName) existing.sources.push(sourceName);
      grouped.set(signal.targetType, existing);
    };
    samples.forEach((sample) => {
      const signals = sample && sample.modelResult && Array.isArray(sample.modelResult.prioritySignals)
        ? sample.modelResult.prioritySignals
        : [];
      signals.forEach((signal) => addSignal(signal, sample.name));
    });
    state.importedModelResults
      .filter((result) => result.mode === mode && Array.isArray(result.prioritySignals))
      .forEach((result) => {
        const sourceName = result.modelVersion || result.adapter || "model";
        result.prioritySignals.forEach((signal) => addSignal(signal, sourceName));
    });
    return Array.from(grouped.values()).map((item) => ({
      ...item,
      weight: roundMetric(item.weight),
      reasons: Array.from(new Set(item.reasons)).slice(0, 3),
      sources: Array.from(new Set(item.sources)).slice(0, 3)
    }));
  }

  function shotGuideTargets(mode, checklist) {
    const order = new Map(sampleTypeCatalog(mode).map((item, index) => [item.value, index]));
    const prioritySignals = new Map(prioritySignalsForMode(mode).map((item) => [item.targetType, item]));
    const grouped = new Map();
    (checklist && Array.isArray(checklist.tasks) ? checklist.tasks : [])
      .filter((item) => item.status !== "done" && item.sampleType && item.action)
      .forEach((item) => {
        const signal = prioritySignals.get(item.sampleType) || null;
        const existing = grouped.get(item.sampleType) || {
          sampleType: item.sampleType,
          label: sampleTypeLabel(mode, item.sampleType),
          status: "partial",
          labels: [],
          reasons: [],
          taskKeys: [],
          prioritySignal: signal,
          signalWeight: signal ? Number(signal.weight || 0) : 0,
          action: shotActionForType(mode, item.sampleType) || item.action
        };
        existing.labels.push(item.label);
        existing.reasons.push(item.reason);
        existing.taskKeys.push(item.key);
        if (signal) {
          existing.prioritySignal = signal;
          existing.signalWeight = Math.max(existing.signalWeight || 0, Number(signal.weight || 0));
        }
        if (item.status === "pending") existing.status = "pending";
        grouped.set(item.sampleType, existing);
      });
    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        label: `${item.label}（${item.labels.length}项）`,
        reason: item.prioritySignal && item.prioritySignal.reasons.length
          ? item.prioritySignal.reasons[0]
          : `${item.labels.slice(0, 4).join("、")}${item.labels.length > 4 ? `等${item.labels.length}项` : ""}`,
        keypointDriven: Boolean(item.prioritySignal),
        statusLabel: shotTaskStatusLabel(item.status)
      }))
      .sort((a, b) => {
        const statusRank = (value) => value === "pending" ? 0 : 1;
        return statusRank(a.status) - statusRank(b.status) ||
          Number(b.signalWeight || 0) - Number(a.signalWeight || 0) ||
          (order.get(a.sampleType) ?? 99) - (order.get(b.sampleType) ?? 99) ||
          a.label.localeCompare(b.label);
      });
  }

  function shotGuideTargetByType(mode, type) {
    const checklist = currentShotChecklist(mode);
    return shotGuideTargets(mode, checklist).find((item) => item.sampleType === type) || null;
  }

  function nextShotGuideTarget(mode, excludeType = "") {
    if (!["palm", "face"].includes(mode)) return null;
    const targets = shotGuideTargets(mode, currentShotChecklist(mode));
    return targets.find((item) => item.sampleType !== excludeType) || targets[0] || null;
  }

  function shotGuideSnapshot(mode, checklist = null) {
    const actualChecklist = checklist || currentShotChecklist(mode);
    const guide = state.shotGuides[mode];
    const targets = shotGuideTargets(mode, actualChecklist);
    return {
      active: Boolean(guide && guide.active),
      currentType: guide && guide.currentType ? guide.currentType : null,
      currentLabel: guide && guide.currentLabel ? guide.currentLabel : null,
      completedTypes: guide && Array.isArray(guide.completedTypes) ? guide.completedTypes : [],
      confirmedTypes: guide && Array.isArray(guide.confirmedTypes) ? guide.confirmedTypes : [],
      qualityGate: guide && guide.qualityGate ? guide.qualityGate : null,
      remainingTargets: targets.map((item) => ({
        sampleType: item.sampleType,
        label: item.label,
        status: item.status,
        taskKeys: item.taskKeys,
        keypointDriven: item.keypointDriven,
        signalWeight: item.signalWeight || 0
      })),
      updatedAt: guide && guide.updatedAt ? guide.updatedAt : null,
      completedAt: guide && guide.completedAt ? guide.completedAt : null
    };
  }

  function shotGuideQualityGateBlock(gate) {
    if (!gate) return "";
    const tone = gate.accepted ? (gate.status === "confirmed" ? "green" : "gold") : "red";
    return `
      <div class="shot-quality-gate ${gate.accepted ? "accepted" : "retake"}">
        <span class="tag ${tone}">${escapeHtml(gate.statusLabel)}</span>
        <span>${escapeHtml(gate.reason)}</span>
      </div>
    `;
  }

  function shotTaskStatusFromMatrix(item) {
    if (item.manualConfirmed || item.modelConfirmed || item.status === "ready") return "done";
    if (item.status === "partial") return "partial";
    return "pending";
  }

  function shotTaskStatusFromAnnotation(item) {
    if (!item || ["need_more", "unknown"].includes(item.status)) return "pending";
    if (["weak", "asymmetric"].includes(item.status)) return "partial";
    return "done";
  }

  function shotTaskStatusLabel(status) {
    if (status === "done") return "已补齐";
    if (status === "partial") return "可粗看";
    return "待补拍";
  }

  function shotTaskStatusClass(status) {
    if (status === "done") return "green";
    if (status === "partial") return "gold";
    return "";
  }

  function shotGuidePanel(mode, checklist) {
    const targets = shotGuideTargets(mode, checklist);
    const guide = state.shotGuides[mode];
    if (!targets.length) {
      return `
        <div class="shot-guide-panel complete">
          <div>
            <strong>拍照向导</strong>
            <div class="case-meta">当前没有待补拍角度，后续以人工复核和案例反馈为主。</div>
          </div>
        </div>
      `;
    }
    if (guide && guide.active) {
      const current = targets.find((item) => item.sampleType === guide.currentType) || {
        sampleType: guide.currentType,
        label: guide.currentLabel || sampleTypeLabel(mode, guide.currentType),
        action: guide.action || shotActionForType(mode, guide.currentType),
        reason: guide.reason || "当前向导目标",
        status: "pending",
        statusLabel: "待补拍"
      };
      return `
        <div class="shot-guide-panel active ${guide.qualityGate && !guide.qualityGate.accepted ? "needs-retake" : ""}">
          <div>
            <strong>拍照向导：下一张 ${escapeHtml(current.label)}</strong>
            <div class="case-meta">${escapeHtml(current.reason)}${current.keypointDriven ? " · 关键点优先" : ""} · 剩余 ${targets.length} 个角度目标</div>
            ${current.keypointDriven ? `<div class="tag-row"><span class="tag gold">关键点优先</span></div>` : ""}
            <p>${escapeHtml(current.action)}</p>
            ${shotGuideQualityGateBlock(guide.qualityGate)}
          </div>
          <div class="shot-guide-controls">
            <button class="secondary-action" type="button" data-shot-guide-camera="${mode}">开启摄像头</button>
            <button class="secondary-action" type="button" data-shot-guide-next="${mode}">跳到下一项</button>
            <button class="secondary-action" type="button" data-shot-guide-stop="${mode}">退出向导</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="shot-guide-panel">
        <div>
          <strong>拍照向导</strong>
          <div class="case-meta">按待补拍角度自动设定下一张；拍完后会跳到下一个目标。</div>
          <div class="tag-row">
            ${targets.slice(0, 5).map((item) => `<span class="tag ${item.keypointDriven ? "gold" : shotTaskStatusClass(item.status)}">${escapeHtml(item.keypointDriven ? `${item.label} · 关键点` : item.label)}</span>`).join("")}
          </div>
        </div>
        <div class="shot-guide-controls">
          <button class="secondary-action" type="button" data-shot-guide-start="${mode}">按清单开始</button>
        </div>
      </div>
    `;
  }

  function shotChecklistBlock(mode, checklist) {
    if (!checklist || !checklist.total) return "";
    const activeTasks = checklist.tasks
      .filter((item) => item.status !== "done")
      .concat(checklist.tasks.filter((item) => item.status === "done"));
    return `
      <div class="mini-block shot-checklist">
        <p><b>补拍任务完成度 ${checklist.doneCount}/${checklist.total}（${percent(checklist.completion)}）</b>：已补齐 ${checklist.doneCount} 项，可粗看 ${checklist.partialCount} 项，待补拍 ${checklist.pendingCount} 项。</p>
        <div class="shot-progress" aria-label="补拍任务完成度 ${percent(checklist.completion)}">
          <span style="inline-size: ${percent(checklist.completion)}"></span>
        </div>
        ${shotGuidePanel(mode, checklist)}
        <div class="shot-task-list">
          ${activeTasks.map((item) => `
            <div class="shot-task ${item.status}">
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                <div class="case-meta">${escapeHtml(item.group)} · ${escapeHtml(item.reason)}</div>
                ${item.action && item.status !== "done" ? `<p>${escapeHtml(item.action)}</p>` : ""}
              </div>
              <div class="shot-task-actions">
                <span class="tag ${shotTaskStatusClass(item.status)}">${escapeHtml(item.statusLabel)}</span>
                ${item.sampleType && item.status !== "done" ? `<button class="secondary-action shot-guide-action" type="button" data-next-shot-mode="${mode}" data-next-shot-type="${escapeHtml(item.sampleType)}">设为下一张</button>` : ""}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function addShotPlanItem(items, item) {
    if (!item.action) return;
    const existing = items.get(item.action);
    if (!existing || item.priority > existing.priority) {
      items.set(item.action, item);
    }
  }

  function nextShotBlock(plan) {
    if (!plan.length) {
      return `
        <div class="mini-block">
          <p><b>智能补图清单</b>：当前关键角度已覆盖，下一步以人工复核细节和案例反馈为主。</p>
        </div>
      `;
    }
    return `
      <div class="mini-block">
        <p><b>智能补图清单</b>：按下面顺序补拍，可把任意照片逐步补齐到可判断。</p>
        <div class="capability-grid">
          ${plan.map((item) => `
            <div class="capability-item ${item.priority >= 4 ? "missing" : "partial"}">
              <strong>${escapeHtml(item.label)}</strong>
              <div class="case-meta">${escapeHtml(item.reason)}</div>
              <p>${escapeHtml(item.action)}</p>
              ${item.sampleType ? `<button class="secondary-action shot-guide-action" type="button" data-next-shot-mode="${shotModeForType(item.sampleType)}" data-next-shot-type="${escapeHtml(item.sampleType)}">设为下一张</button>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function shotActionForType(mode, type) {
    const palm = {
      palm_front: "拍掌心正面：手腕到指根都入镜，掌心摊平，光线均匀。",
      palm_side: "拍小指侧边：镜头贴近小指下方侧面，用来补婚姻线和侧边细纹。",
      palm_main_detail: "拍掌心三大主线近照：生命线、智慧线、感情线要横跨画面，减少反光。",
      palm_sun_wealth_detail: "拍无名指到小指下方近照：太阳丘、水星丘、太阳线和财运纹要清楚。",
      palm_helper_detail: "拍拇指根部到生命线内侧近照：贵人线、影响线和虎口支撑要清楚。",
      nails: "拍五指指甲近照：指甲、甲色和指尖都清楚。",
      thumb: "拍拇指与虎口：拇指根部、虎口和掌边不要裁掉。",
      palm_back: "拍手背正面：手背骨肉、手指长度和关节轮廓要完整。"
    };
    const face = {
      face_front: "拍正脸：额头到下巴完整，左右耳附近轮廓尽量都入镜。",
      face_side: "拍侧脸：额头、鼻梁、嘴唇、下巴侧面连线要清楚。",
      face_three_quarter: "拍三分之二侧脸：保留一侧轮廓和另一侧五官立体度。",
      eyes: "拍眉眼局部：眉毛、眼神和眼下状态要清晰。",
      nose: "拍鼻部局部：山根、鼻梁、鼻头和鼻翼都入镜。",
      mouth_jaw: "拍口下巴局部：嘴型、人中、下巴和下颌承托要清楚。",
      forehead: "拍额头局部：发际线、额头宽窄和上庭光洁度要清楚。"
    };
    return (mode === "palm" ? palm : face)[type] || "";
  }

  function shotModeForType(type) {
    return type.startsWith("face_") || ["forehead", "eyes", "nose", "mouth_jaw"].includes(type) ? "face" : "palm";
  }

  function shotActionForRegion(mode, key) {
    const palm = {
      main_lines: shotActionForType("palm", "palm_front"),
      career_fate: shotActionForType("palm", "palm_front"),
      sun_wealth: shotActionForType("palm", "palm_sun_wealth_detail"),
      helper_line: shotActionForType("palm", "palm_helper_detail"),
      marriage: shotActionForType("palm", "palm_side"),
      thumb: shotActionForType("palm", "thumb"),
      nails: shotActionForType("palm", "nails"),
      back_shape: shotActionForType("palm", "palm_back")
    };
    const face = {
      three_parts: shotActionForType("face", "face_front"),
      profile: shotActionForType("face", "face_side"),
      shape: shotActionForType("face", "face_three_quarter"),
      forehead: shotActionForType("face", "forehead"),
      brow_eye: shotActionForType("face", "eyes"),
      nose: shotActionForType("face", "nose"),
      mouth_jaw: shotActionForType("face", "mouth_jaw")
    };
    return (mode === "palm" ? palm : face)[key] || "";
  }

  function shotTypeForRegion(mode, key) {
    const palm = {
      main_lines: "palm_main_detail",
      career_fate: "palm_main_detail",
      sun_wealth: "palm_sun_wealth_detail",
      helper_line: "palm_helper_detail",
      marriage: "palm_side",
      thumb: "thumb",
      nails: "nails",
      back_shape: "palm_back"
    };
    const face = {
      three_parts: "face_front",
      profile: "face_side",
      shape: "face_three_quarter",
      forehead: "forehead",
      brow_eye: "eyes",
      nose: "nose",
      mouth_jaw: "mouth_jaw"
    };
    return (mode === "palm" ? palm : face)[key] || "";
  }

  function shotActionForAnnotation(mode, key) {
    const palm = {
      life_line: shotActionForType("palm", "palm_main_detail"),
      head_line: shotActionForType("palm", "palm_main_detail"),
      heart_line: shotActionForType("palm", "palm_main_detail"),
      fate_line: shotActionForType("palm", "palm_main_detail"),
      sun_line: shotActionForType("palm", "palm_sun_wealth_detail"),
      wealth_lines: shotActionForType("palm", "palm_sun_wealth_detail"),
      helper_lines: shotActionForType("palm", "palm_helper_detail"),
      marriage_lines: shotActionForType("palm", "palm_side")
    };
    const face = {
      three_courts: shotActionForType("face", "face_front"),
      face_shape: shotActionForType("face", "face_three_quarter"),
      forehead_zone: shotActionForType("face", "forehead"),
      brow_eye_zone: shotActionForType("face", "eyes"),
      nose_zone: shotActionForType("face", "nose"),
      mouth_jaw_zone: shotActionForType("face", "mouth_jaw"),
      profile_zone: shotActionForType("face", "face_side"),
      complexion_zone: shotActionForType("face", "face_front")
    };
    return (mode === "palm" ? palm : face)[key] || "";
  }

  function shotTypeForAnnotation(mode, key) {
    const palm = {
      life_line: "palm_main_detail",
      head_line: "palm_main_detail",
      heart_line: "palm_main_detail",
      fate_line: "palm_main_detail",
      sun_line: "palm_sun_wealth_detail",
      wealth_lines: "palm_sun_wealth_detail",
      helper_lines: "palm_helper_detail",
      marriage_lines: "palm_side"
    };
    const face = {
      three_courts: "face_front",
      face_shape: "face_three_quarter",
      forehead_zone: "forehead",
      brow_eye_zone: "eyes",
      nose_zone: "nose",
      mouth_jaw_zone: "mouth_jaw",
      profile_zone: "face_side",
      complexion_zone: "face_front"
    };
    return (mode === "palm" ? palm : face)[key] || "";
  }

  function experienceProfile(mode) {
    const observedCases = state.caseLibrary.filter((item) => caseMode(item) === mode && !isPersonalMasterCase(item));
    const cases = observedCases.filter(caseTraditionalLearningEligible);
    const profile = {
      mode,
      total: cases.length,
      excludedUnreviewed: observedCases.length - cases.length,
      libraryComplete: state.caseLibraryFullyLoaded,
      loadedCaseCount: state.caseLibrary.length,
      totalCaseCount: state.caseLibraryTotalCount || state.caseLibrary.length,
      reviewed: 0,
      accurate: 0,
      partial: 0,
      wrong: 0,
      accurateRate: null,
      scoreAdjustment: 0,
      weakRegions: [],
      correctionTopics: []
    };
    const weakRegionCounts = new Map();
    const correctionCounts = new Map();
    for (const item of cases) {
      const feedback = caseFeedback(item);
      if (profile[feedback.rating] !== undefined) profile[feedback.rating] += 1;
      if (feedback.rating === "unreviewed") continue;
      profile.reviewed += 1;
      if (feedback.rating !== "accurate") {
        collectWeakRegions(item.payload, weakRegionCounts);
        collectFeedbackTopics(mode, feedback.note, correctionCounts);
      }
    }
    profile.accurateRate = profile.reviewed ? Math.round((profile.accurate / profile.reviewed) * 100) : null;
    profile.scoreAdjustment = profile.libraryComplete ? experienceScoreAdjustment(profile) : 0;
    profile.weakRegions = topCountItems(weakRegionCounts, 4);
    profile.correctionTopics = topCountItems(correctionCounts, 4);
    return profile;
  }

  function caseMode(item) {
    return item.mode || (item.payload && item.payload.type) || "";
  }

  function caseTraditionalLearningEligible(item) {
    return caseEvidenceRuntime.eligible(item, isPersonalMasterCase(item));
  }

  function collectWeakRegions(payload, counts) {
    if (!payload) return;
    (payload.matrix || []).forEach((item) => {
      if (item && item.status !== "ready") incrementCount(counts, item.label || item.key);
    });
    [...(payload.lineAnnotations || []), ...(payload.zoneAnnotations || [])].forEach((item) => {
      if (item && ["need_more", "weak", "broken", "asymmetric", "unknown"].includes(item.status)) {
        incrementCount(counts, item.label || item.key);
      }
    });
  }

  function collectFeedbackTopics(mode, note, counts) {
    const text = String(note || "");
    const topics = mode === "palm"
      ? [
          ["太阳线", /太阳|名声|曝光|口碑/],
          ["财运纹", /财|钱|收入|副业|项目/],
          ["贵人线", /贵人|帮助|资源|合作|前辈/],
          ["婚姻线", /婚|恋爱|感情|对象|关系/],
          ["事业线", /事业|工作|平台|职业|命运线/],
          ["生命线", /生命线|精力|健康|体力|作息/],
          ["智慧线", /智慧线|学习|判断|思维|决策/]
        ]
      : [
          ["三庭比例", /三庭|上庭|中庭|下庭|比例/],
          ["眉眼区", /眉|眼|神采|执行|观察/],
          ["鼻部", /鼻|财帛|资源|财务/],
          ["口下巴", /口|嘴|下巴|承诺|合作|晚年/],
          ["脸型轮廓", /脸型|轮廓|骨相|形状/],
          ["气色", /气色|疲|睡眠|状态|压力/]
        ];
    let matched = false;
    topics.forEach(([label, pattern]) => {
      if (pattern.test(text)) {
        incrementCount(counts, label);
        matched = true;
      }
    });
    if (!matched && text) incrementCount(counts, "人工备注");
  }

  function experienceScoreAdjustment(profile) {
    if (profile.reviewed < 3) return 0;
    const accurateRate = profile.accurate / profile.reviewed;
    const weakRate = (profile.partial + profile.wrong) / profile.reviewed;
    if (accurateRate >= 0.78) return 2;
    if (profile.wrong / profile.reviewed >= 0.34) return -4;
    if (weakRate >= 0.5) return -2;
    return 0;
  }

  function applyExperienceToScores(scores, profile) {
    if (!profile || profile.libraryComplete === false || !profile.scoreAdjustment) return scores;
    return Object.fromEntries(
      Object.entries(scores).map(([key, value]) => [key, clamp(value + profile.scoreAdjustment, 0, 96)])
    );
  }

  function experienceBlock(profile) {
    if (!profile || !profile.total) {
      const excluded = profile && profile.excludedUnreviewed ? `另有 ${profile.excludedUnreviewed} 个仅照片/几何案例，未进入传统学习。` : "";
      return `
        <div class="mini-block">
          <p><b>经验学习层</b>：暂无传统语义已复核的同类案例。${excluded}</p>
        </div>
      `;
    }
    const rateText = profile.accurateRate === null ? "等待验证" : `${profile.accurateRate}%`;
    const pagingText = profile.libraryComplete === false
      ? `案例整理 ${profile.loadedCaseCount}/${profile.totalCaseCount}，补齐前不调分。`
      : "";
    const adjustmentText = profile.scoreAdjustment > 0
      ? `经验加权 +${profile.scoreAdjustment}`
      : profile.scoreAdjustment < 0
        ? `经验保守 ${profile.scoreAdjustment}`
        : "暂不调分";
    const topicTags = profile.correctionTopics.length
      ? profile.correctionTopics.map((item) => `<span class="tag gold">${escapeHtml(item.label)}×${item.count}</span>`).join("")
      : `<span class="tag green">暂无集中修正点</span>`;
    const weakTags = profile.weakRegions.length
      ? profile.weakRegions.map((item) => `<span class="tag">${escapeHtml(item.label)}×${item.count}</span>`).join("")
      : `<span class="tag green">覆盖较稳</span>`;
    return `
      <div class="mini-block">
        <p><b>经验学习层</b>：同类样本 ${profile.total}，已验证 ${profile.reviewed}，准确率 ${rateText}，${adjustmentText}。${pagingText}</p>
        <div class="tag-row">${topicTags}</div>
        <div class="case-meta">优先复核：${weakTags}</div>
      </div>
    `;
  }

  function similarCaseProfile(mode, samples, limit = 4) {
    const currentSamples = modeAnalysisSamples(samples).filter((sample) => sample && sample.metrics);
    const observedCases = state.caseLibrary.filter((item) => !isPersonalMasterCase(item) && caseMode(item) === mode && item.payload && Array.isArray(item.payload.samples));
    const allCases = observedCases.filter(caseTraditionalLearningEligible);
    const cases = allCases.slice(0, similarCaseScanLimit);
    const matches = [];
    if (currentSamples.length) {
      cases.forEach((item) => {
        const savedSamples = modeAnalysisSamples(item.payload.samples).filter((sample) => sample && sample.metrics);
        const match = bestSimilarSampleMatch(mode, currentSamples, savedSamples);
        if (!match || match.score < 0.44) return;
        const feedback = caseFeedback(item);
        matches.push({
          caseId: item.id,
          title: item.title || caseTitle(item.payload),
          createdAt: item.createdAt,
          score: match.score,
          feedback,
          currentSample: sampleSimilaritySummary(mode, match.currentSample),
          caseSample: sampleSimilaritySummary(mode, match.caseSample),
          reasons: match.reasons,
          thumbnail: thumbnailForCaseSample(item, match.caseSample)
        });
      });
    }
    return {
      mode,
      currentSampleCount: currentSamples.length,
      totalCases: allCases.length,
      excludedUnreviewedCases: observedCases.length - allCases.length,
      scannedCases: cases.length,
      matchedCount: matches.length,
      matches: matches
        .sort((a, b) => b.score - a.score || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, limit),
      generatedAt: new Date().toISOString()
    };
  }

  function similarCaseCalibration(profile) {
    const threshold = 0.68;
    const base = {
      mode: profile && profile.mode ? profile.mode : "",
      status: "waiting",
      statusLabel: "等待图片",
      threshold,
      strongMatches: 0,
      reviewedMatches: 0,
      accurate: 0,
      partial: 0,
      wrong: 0,
      reliableRate: null,
      riskLevel: "unknown",
      reviewFocus: [],
      evidenceSummary: "",
      recommendations: [],
      confidenceAdjustment: {
        direction: "neutral",
        value: 0,
        label: "只作复核提示，不调分",
        appliesToScores: false
      },
      generatedAt: new Date().toISOString()
    };
    if (!profile || !profile.currentSampleCount) {
      return {
        ...base,
        evidenceSummary: "当前还没有可对照样本。",
        recommendations: ["先上传可判断的手相或面相图片，再进入相似案例校准。"]
      };
    }
    if (!profile.totalCases) {
      return {
        ...base,
        status: "no_cases",
        statusLabel: "暂无案例",
        evidenceSummary: profile.excludedUnreviewedCases ? `已有 ${profile.excludedUnreviewedCases} 个仅照片/几何案例，但没有传统语义已复核案例。` : "本地案例库还没有同类样本。",
        recommendations: ["先人工复核传统特征并保存反馈，后续才能校准传统判断。"]
      };
    }
    const strongMatches = (profile.matches || []).filter((item) => item.score >= threshold);
    if (!strongMatches.length) {
      return {
        ...base,
        status: "no_strong_match",
        statusLabel: "相似不足",
        evidenceSummary: `已扫描 ${profile.scannedCases || profile.totalCases}/${profile.totalCases} 个同类案例，但没有达到 ${percent(threshold)} 的高相似样本。`,
        recommendations: ["本次不做历史经验校准，仍以当前图片、识别就绪度和人工复核为主。"]
      };
    }
    const reviewedMatches = strongMatches.filter((item) => item.feedback && item.feedback.rating !== "unreviewed");
    const focusCounts = new Map();
    const reasonCounts = new Map();
    reviewedMatches.forEach((item) => {
      const rating = item.feedback.rating;
      if (base[rating] !== undefined) base[rating] += 1;
      (item.reasons || []).forEach((reason) => incrementCount(reasonCounts, reason));
      if (rating !== "accurate") {
        collectFeedbackTopics(profile.mode, item.feedback.note, focusCounts);
        incrementCount(focusCounts, item.currentSample && item.currentSample.label);
        incrementCount(focusCounts, item.caseSample && item.caseSample.label);
      }
    });
    base.strongMatches = strongMatches.length;
    base.reviewedMatches = reviewedMatches.length;
    base.reviewFocus = topCountItems(focusCounts, 4);
    if (!base.reviewFocus.length) {
      base.reviewFocus = topCountItems(reasonCounts, 3);
    }
    if (reviewedMatches.length < 2) {
      return {
        ...base,
        status: "insufficient_review",
        statusLabel: "验证不足",
        riskLevel: "unknown",
        evidenceSummary: `找到 ${strongMatches.length} 个高相似样本，其中已验证 ${reviewedMatches.length} 个。`,
        recommendations: ["高相似样本的人工反馈还不够，先只用于回看，不提高或降低本次判断信任度。"]
      };
    }
    base.reliableRate = roundMetric(base.accurate / reviewedMatches.length);
    const weakRate = (base.partial + base.wrong) / reviewedMatches.length;
    const wrongRate = base.wrong / reviewedMatches.length;
    if (wrongRate >= 0.34 || base.reliableRate < 0.45) {
      base.status = "caution";
      base.statusLabel = "谨慎复核";
      base.riskLevel = "high";
      base.confidenceAdjustment = {
        direction: "caution",
        value: 0,
        label: "历史相似样本偏差较多，降低主观信任",
        appliesToScores: false
      };
      base.recommendations = [
        "相似案例曾出现明显偏差，当前结论要优先复核关键线纹、角度和人工标注。",
        "不要只看总分，先处理复核焦点后再综合事业、财运、感情和健康建议。"
      ];
    } else if (base.reliableRate >= 0.75 && reviewedMatches.length >= 3) {
      base.status = "supportive";
      base.statusLabel = "历史较稳";
      base.riskLevel = "low";
      base.confidenceAdjustment = {
        direction: "support",
        value: 0,
        label: "历史相似样本反馈较稳，可提高复核信任",
        appliesToScores: false
      };
      base.recommendations = [
        "相似样本反馈较稳，当前图片可作为综合判断依据之一。",
        "仍需结合识别就绪度和补拍清单，不自动覆盖当前识别结果。"
      ];
    } else if (weakRate >= 0.5) {
      base.status = "mixed";
      base.statusLabel = "一半需修";
      base.riskLevel = "medium";
      base.confidenceAdjustment = {
        direction: "caution",
        value: 0,
        label: "历史相似样本有较多部分准确，保持保守",
        appliesToScores: false
      };
      base.recommendations = [
        "相似样本反馈分歧较大，当前报告应保守表达。",
        "优先核对复核焦点，再决定是否需要补拍局部近照。"
      ];
    } else {
      base.status = "neutral",
      base.statusLabel = "中性参考";
      base.riskLevel = "medium";
      base.recommendations = [
        "高相似样本有一定参考价值，但不足以改变本次判断。",
        "按当前识别矩阵、补拍清单和人工复核继续。"
      ];
    }
    base.evidenceSummary = `高相似 ${strongMatches.length} 个，已验证 ${reviewedMatches.length} 个，准确 ${base.accurate}、部分准确 ${base.partial}、不准确 ${base.wrong}，可靠率 ${percent(base.reliableRate)}。`;
    return base;
  }

  function bestSimilarSampleMatch(mode, currentSamples, savedSamples) {
    let best = null;
    currentSamples.forEach((currentSample) => {
      savedSamples.forEach((caseSample) => {
        const result = sampleSimilarity(mode, currentSample, caseSample);
        if (!best || result.score > best.score) {
          best = {
            ...result,
            currentSample,
            caseSample
          };
        }
      });
    });
    return best;
  }

  function sampleSimilarity(mode, currentSample, caseSample) {
    const typeScore = sampleTypeSimilarity(mode, currentSample.type, caseSample.type);
    const metricScore = sampleMetricSimilarity(mode, currentSample.metrics, caseSample.metrics);
    const warningScore = warningSimilarity(currentSample.warnings, caseSample.warnings);
    const orientationScore = sampleOrientationSimilarity(mode, currentSample, caseSample);
    const feedbackScore = 0.62;
    const score = roundMetric(clamp(typeScore * 0.34 + metricScore * 0.42 + warningScore * 0.1 + orientationScore * 0.08 + feedbackScore * 0.06, 0, 1));
    return {
      score,
      typeScore: roundMetric(typeScore),
      metricScore: roundMetric(metricScore),
      warningScore: roundMetric(warningScore),
      orientationScore: roundMetric(orientationScore),
      reasons: sampleSimilarityReasons(mode, currentSample, caseSample, typeScore, metricScore, orientationScore)
    };
  }

  function sampleTypeSimilarity(mode, a, b) {
    if (!a || !b) return 0.18;
    if (a === b) return 1;
    return sampleTypeFamily(mode, a) === sampleTypeFamily(mode, b) ? 0.62 : 0.22;
  }

  function sampleTypeFamily(mode, type) {
    if (mode === "palm") {
      if (["palm_front", "palm_main_detail"].includes(type)) return "palm_main";
      if (["palm_side", "palm_sun_wealth_detail", "palm_helper_detail"].includes(type)) return "palm_detail";
      if (["nails", "thumb", "palm_back"].includes(type)) return type;
      return "palm_other";
    }
    if (["face_front", "forehead", "eyes", "nose", "mouth_jaw"].includes(type)) return "face_front_zone";
    if (["face_side"].includes(type)) return "face_side";
    if (["face_three_quarter"].includes(type)) return "face_shape";
    return "face_other";
  }

  function sampleMetricSimilarity(mode, currentMetrics, caseMetrics) {
    const keys = mode === "palm"
      ? ["quality", "brightness", "contrast", "lineClarity", "textureBusy", "redness", "warmth", "subjectAreaRatio", "subjectCenteredness", "skinCoverage"]
      : ["quality", "brightness", "contrast", "lineClarity", "textureBusy", "warmth", "subjectAreaRatio", "subjectCenteredness", "skinCoverage", "symmetry"];
    const scores = keys
      .map((key) => {
        const left = Number(currentMetrics && currentMetrics[key]);
        const right = Number(caseMetrics && caseMetrics[key]);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
        return clamp(1 - Math.abs(left - right) / metricSimilarityScale(key), 0, 1);
      })
      .filter((value) => value !== null);
    return scores.length ? average(scores) : 0.36;
  }

  function metricSimilarityScale(key) {
    if (["brightness", "contrast", "redness", "warmth"].includes(key)) return 0.34;
    if (["subjectAreaRatio", "skinCoverage", "symmetry"].includes(key)) return 0.42;
    return 0.5;
  }

  function warningSimilarity(currentWarnings, caseWarnings) {
    const left = new Set(Array.isArray(currentWarnings) ? currentWarnings : []);
    const right = new Set(Array.isArray(caseWarnings) ? caseWarnings : []);
    if (!left.size && !right.size) return 0.78;
    const union = new Set([...left, ...right]);
    const intersection = [...left].filter((item) => right.has(item));
    return union.size ? intersection.length / union.size : 0.5;
  }

  function sampleOrientationSimilarity(mode, currentSample, caseSample) {
    if (mode === "palm") {
      const left = currentSample.handOrientation && currentSample.handOrientation.side;
      const right = caseSample.handOrientation && caseSample.handOrientation.side;
      if (!left || !right || left === "unknown" || right === "unknown") return 0.54;
      return left === right ? 1 : 0.26;
    }
    const left = currentSample.faceOrientation && currentSample.faceOrientation.pose;
    const right = caseSample.faceOrientation && caseSample.faceOrientation.pose;
    if (!left || !right || left === "unknown" || right === "unknown") return 0.54;
    return left === right ? 1 : 0.26;
  }

  function sampleSimilarityReasons(mode, currentSample, caseSample, typeScore, metricScore, orientationScore) {
    const reasons = [];
    if (typeScore >= 1) reasons.push(`同为${sampleTypeLabel(mode, currentSample.type)}`);
    else if (typeScore >= 0.6) reasons.push(`同类角度 ${sampleTypeLabel(mode, currentSample.type)} / ${sampleTypeLabel(mode, caseSample.type)}`);
    if (metricScore >= 0.72) reasons.push("图像质量和主体比例接近");
    else if (metricScore >= 0.55) reasons.push("基础画面特征部分接近");
    if (orientationScore >= 0.9) reasons.push(mode === "palm" ? "左右手候选一致" : "面部朝向候选一致");
    if (!reasons.length) reasons.push("按角度、质量和主体特征弱相似");
    return reasons.slice(0, 4);
  }

  function sampleSimilaritySummary(mode, sample) {
    return {
      name: sample.name || "",
      type: sample.type || "",
      label: sample.label || sampleTypeLabel(mode, sample.type),
      quality: sample.quality ?? null
    };
  }

  function thumbnailForCaseSample(item, caseSample) {
    const thumbnails = Array.isArray(item.thumbnails) && item.thumbnails.length
      ? item.thumbnails
      : caseThumbnailsFromPayload(item.payload);
    const exact = thumbnails.find((thumb) => thumb.sampleName && thumb.sampleName === caseSample.name) ||
      thumbnails.find((thumb) => thumb.sampleType && thumb.sampleType === caseSample.type) ||
      thumbnails[0];
    if (!exact || !safeThumbnailDataUrl(exact.dataUrl)) return null;
    return {
      dataUrl: safeThumbnailDataUrl(exact.dataUrl),
      label: exact.label || sampleTypeLabel(caseMode(item), exact.sampleType),
      sampleType: exact.sampleType || "",
      width: exact.width || null,
      height: exact.height || null
    };
  }

  function similarCaseBlock(profile) {
    if (!profile || !profile.currentSampleCount) {
      return `
        <div class="mini-block">
          <p><b>相似案例回看</b>：先上传图片，系统会用当前样本和已保存案例做角度、质量、主体比例和反馈对照。</p>
        </div>
      `;
    }
    if (!profile.totalCases) {
      return `
        <div class="mini-block">
          <p><b>相似案例回看</b>：还没有同类历史案例。保存并反馈几次后，后续图片会自动回看相似样本。</p>
        </div>
      `;
    }
    if (!profile.matches.length) {
      return `
        <div class="mini-block">
          <p><b>相似案例回看</b>：已有 ${profile.totalCases} 个同类案例，本次按性能保护扫描最近 ${profile.scannedCases} 个，当前图片和历史样本相似度不足，仍以当前图像和人工复核为主。</p>
        </div>
      `;
    }
    return `
      <div class="mini-block">
        <p><b>相似案例回看</b>：已扫描最近 ${profile.scannedCases}/${profile.totalCases} 个同类案例，找到 ${profile.matchedCount} 个相近样本，历史反馈只作校准参照。</p>
        <div class="similar-case-list">
          ${profile.matches.map((item) => `
            <div class="similar-case-item">
              ${item.thumbnail ? `<span class="case-thumbnail"><img src="${escapeHtml(item.thumbnail.dataUrl)}" alt="${escapeHtml(item.thumbnail.label || "相似案例")}" loading="lazy"></span>` : ""}
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <div class="case-meta">相似 ${percent(item.score)} · ${escapeHtml(feedbackLabel(item.feedback.rating))} · ${escapeHtml(formatIsoTime(item.createdAt || ""))}</div>
                <div class="case-meta">${escapeHtml(item.currentSample.label)} ↔ ${escapeHtml(item.caseSample.label)}；${item.reasons.map(escapeHtml).join("、")}</div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function similarCaseCalibrationBlock(calibration) {
    if (!calibration) return "";
    const tone = calibration.status === "supportive"
      ? "green"
      : ["caution", "mixed"].includes(calibration.status)
        ? "red"
        : calibration.status === "neutral"
          ? "gold"
          : "";
    const focusTags = calibration.reviewFocus && calibration.reviewFocus.length
      ? calibration.reviewFocus.map((item) => `<span class="tag gold">${escapeHtml(item.label)}×${item.count}</span>`).join("")
      : `<span class="tag green">暂无集中偏差</span>`;
    const tips = calibration.recommendations && calibration.recommendations.length
      ? calibration.recommendations.map((item) => `<p>${escapeHtml(item)}</p>`).join("")
      : "";
    return `
      <div class="mini-block">
        <p><b>相似案例校准</b>：<span class="tag ${tone}">${escapeHtml(calibration.statusLabel)}</span> ${escapeHtml(calibration.evidenceSummary)} ${escapeHtml(calibration.confidenceAdjustment.label)}。</p>
        <div class="tag-row">${focusTags}</div>
        ${tips}
      </div>
    `;
  }

  function topCountItems(counts, limit) {
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, limit)
      .map(([label, count]) => ({ label, count }));
  }

  function incrementCount(counts, key) {
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  function readBirthDate() {
    const node = $("#birth-datetime");
    const fallback = new Date("2000-01-01T00:00:00");
    if (!node || !node.value) return fallback;
    const date = new Date(node.value);
    return Number.isNaN(date.getTime()) ? fallback : date;
  }

  function timelineRangeFromInputs(date = readBirthDate()) {
    const birthYear = date.getFullYear();
    const startNode = $("#timeline-start-year");
    const endNode = $("#timeline-end-year");
    const rawStart = Number.parseInt(startNode ? startNode.value : "", 10);
    const rawEnd = Number.parseInt(endNode ? endNode.value : "", 10);
    let startYear = normalizeTimelineYear(rawStart, birthYear);
    let endYear = normalizeTimelineYear(rawEnd, birthYear + 100);
    if (endYear < startYear) [startYear, endYear] = [endYear, startYear];
    startYear = Math.max(startYear, birthYear);
    endYear = Math.max(endYear, startYear);
    const range = {
      birthYear,
      startYear,
      endYear,
      startAge: startYear - birthYear,
      endAge: endYear - birthYear,
      totalYears: endYear - startYear + 1
    };
    syncTimelineRangeInputs(range);
    return range;
  }

  function normalizeTimelineYear(value, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(1900, Math.min(2200, Math.round(value)));
  }

  function syncTimelineRangeInputs(range) {
    const startNode = $("#timeline-start-year");
    const endNode = $("#timeline-end-year");
    if (startNode && String(range.startYear) !== startNode.value) startNode.value = range.startYear;
    if (endNode && String(range.endYear) !== endNode.value) endNode.value = range.endYear;
  }

  function timelineRangeText(range) {
    return `当前逐年范围 ${range.startYear}-${range.endYear}，约 ${range.startAge}-${range.endAge} 岁，共 ${range.totalYears} 年；这是阶段参考，不代表寿命上限或死亡时间。`;
  }

  function renderBaziReport() {
    if (!currentBaziRuntime()) {
      renderBaziRuntimeState("loading");
      ensureBaziRuntime()
        .then(() => renderBaziReport())
        .catch((error) => renderBaziRuntimeState("error", shortError(error)));
      return;
    }
    state.renderedReports.bazi = true;
    const date = readBirthDate();
    const place = $("#birth-place").value || "未填写";
    const gender = $("#birth-gender").value === "male" ? "男" : "女";
    const dayPillar = $("#day-pillar").value.trim();
    const pillars = estimatePillars(date, dayPillar);
    const timelineRange = timelineRangeFromInputs(date);
    const focuses = checkedValues("bazi-focuses");
    const domainFocuses = focuses.filter((key) => ["career", "wealth", "love", "health"].includes(key));
    const showTimeline = focuses.includes("timeline");
    const personalActive = personalProfileModeIsActive("bazi");
    if (personalActive && !state.personalProfileData) {
      renderBaziRuntimeState("loading");
      loadPersonalProfileData().then(() => renderBaziReport()).catch((error) => renderBaziRuntimeState("error", shortError(error)));
      return;
    }
    const chartContext = requireBaziRuntime().buildChartContext(date, $("#birth-gender").value, personalActive ? { data: state.personalProfileData, seed: personalProfileSeed } : null);
    const timeline = personalActive
      ? baziTimeline(date.getFullYear(), pillars, timelineRange, chartContext)
      : showTimeline
        ? baziTimelineProvider(date.getFullYear(), pillars, timelineRange, chartContext)
        : null;
    const personalAnalysis = personalActive
      ? buildPersonalAnalysis("bazi", {
          birth: { datetime: $("#birth-datetime").value, place, gender: $("#birth-gender").value },
          pillars,
          chartContext,
          timeline
        })
      : null;

    setHtml($("#bazi-report"), `
      ${noticeCard()}
      ${personalAnalysisBlock(personalAnalysis)}
      <section class="report-card">
        <h3>基础盘</h3>
        <p>阳历 ${formatDateTime(date)}，${escapeHtml(place)}，${gender}。</p>
        <div class="score-grid">
          ${pillarBox("年柱", pillars.year)}
          ${pillarBox("月柱", pillars.month)}
          ${pillarBox("日柱", pillars.day)}
          ${pillarBox("时支", pillars.hour)}
        </div>
        <p class="muted">四柱由本地懒加载 lunar-javascript 1.7.7 按节气交接时刻计算；传统命理解读仍是民俗参考，不等于事件保证。</p>
      </section>
      <section class="report-card">
        <h3>五行倾向</h3>
        <p>${elementText(pillars)}</p>
      </section>
      ${sourceEvidenceBlock([], "bazi")}
      ${showTimeline ? `
        <section class="report-card">
          <h3>流年逐年详细解读</h3>
          <p class="muted">${timelineRangeText(timelineRange)} 当前每页显示 ${detailedTimelinePageSize} 年，完整年份保留在数据和 JSON 中。关键时段按节气划作复核窗口，不保证某日发生事件；历法、书页方法和案例锚点统一见上方来源区，不在101张年卡里重复。</p>
          ${detailedTimelineBlock("bazi", timeline, timelineRange, domainFocuses)}
        </section>
      ` : ""}
    `);
  }

  function renderBaziRuntimeState(status, error = "") {
    state.renderedReports.bazi = false;
    const target = $("#bazi-report");
    if (!target) return;
    setHtml(target, status === "loading"
      ? '<section class="report-card"><h3>八字分析</h3><p class="muted">正在载入本地计算模块…</p></section>'
      : `<section class="report-card"><h3>八字分析暂未生成</h3><p class="muted">本地计算模块载入失败，点击“生成八字报告”可重试。${error ? `错误：${escapeHtml(error)}` : ""}</p></section>`);
  }

  async function exportAnalysisJson(mode) {
    if (mode === "bazi") {
      try {
        await ensureBaziRuntime();
      } catch (error) {
        renderBaziRuntimeState("error", shortError(error));
        return false;
      }
    }
    if (mode === "palm" || mode === "face") await ensureTraditionalRules();
    const payload = mode === "palm"
      ? palmExportPayload()
      : mode === "face"
        ? faceExportPayload()
        : baziExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${mode}-analysis-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    return true;
  }

  function palmExportPayload() {
    const features = checkedValues("palm-features");
    const activeRules = features.map((key) => rulesFor("palm")[key]).filter(Boolean);
    const lineAnnotations = collectPalmLineAnnotations();
    const experience = experienceProfile("palm");
    const traditionalEvidence = traditionalRules.evidenceSnapshot("palm", features, lineAnnotations, personalProfileModeIsActive("palm"));
    const scores = traditionalEvidence.authorized ? applyExperienceToScores(palmScores(features, lineAnnotations), experience) : null;
    const coverage = recognitionCoverage("palm", state.palmSamples);
    const matrix = recognitionMatrix("palm", state.palmSamples);
    const checklist = shotChecklist("palm", coverage, matrix, lineAnnotations);
    const readiness = recognitionReadiness("palm", coverage, matrix, checklist, state.palmSamples);
    const fallbackPlan = recognitionFallbackPlan("palm", coverage, matrix, checklist, readiness, state.palmSamples);
    const similarCases = similarCaseProfile("palm", state.palmSamples);
    const similarCalibration = similarCaseCalibration(similarCases);
    const timelineRange = timelineRangeFromInputs();
    return {
      type: "palm",
      createdAt: new Date().toISOString(),
      dominantHand: $("#dominant-hand").value,
      currentSide: $("#palm-side").value,
      features,
      scores,
      traditionalEvidence,
      timelineRange,
      timeline: traditionalEvidence.authorized ? palmTimeline(scores, timelineRange) : [],
      metrics: state.palmMetrics,
      coverage,
      matrix,
      recognitionReadiness: readiness,
      recognitionFallback: fallbackPlan,
      similarCases,
      similarCaseCalibration: similarCalibration,
      shotChecklist: checklist,
      shotGuide: shotGuideSnapshot("palm", checklist),
      nextShotPlan: nextShotPlan("palm", coverage, matrix, lineAnnotations),
      manualRegions: Array.from(state.manualRegions.palm),
      modelRegions: Array.from(state.modelRegions.palm),
      modelEndpoint: modelEndpointSnapshot(),
      lineAnnotations,
      creaseStitchCalibration: creaseStitchCalibrationProfile(),
      geometryTrainingProfile: geometryTrainingProfile("palm"),
      geometryCorrections: state.geometryCorrections.palm,
      experienceProfile: experience,
      sourceEvidence: sourceEvidenceSnapshot("palm", activeRules),
      modelResults: modelResultsForMode("palm"),
      routeLearning: routeLearningData("palm"),
      routeCalibration: routeCalibrationSnapshot(),
      feedback: currentFeedback(),
      samples: state.palmSamples.map(sampleForExport),
      boundaries: ["traditional_reference_only", "rule_sources_are_tiered", "unreviewed_semantics_do_not_generate_scores", "no_medical_diagnosis", "no_death_year_prediction"]
    };
  }

  function faceExportPayload() {
    const features = checkedValues("face-features");
    const activeRules = features.map((key) => rulesFor("face")[key]).filter(Boolean);
    const zoneAnnotations = collectFaceZoneAnnotations();
    const experience = experienceProfile("face");
    const traditionalEvidence = traditionalRules.evidenceSnapshot("face", features, zoneAnnotations, personalProfileModeIsActive("face"));
    const scores = traditionalEvidence.authorized ? applyExperienceToScores(faceScores(features, zoneAnnotations), experience) : null;
    const coverage = recognitionCoverage("face", state.faceSamples);
    const matrix = recognitionMatrix("face", state.faceSamples);
    const checklist = shotChecklist("face", coverage, matrix, zoneAnnotations);
    const readiness = recognitionReadiness("face", coverage, matrix, checklist, state.faceSamples);
    const fallbackPlan = recognitionFallbackPlan("face", coverage, matrix, checklist, readiness, state.faceSamples);
    const similarCases = similarCaseProfile("face", state.faceSamples);
    const similarCalibration = similarCaseCalibration(similarCases);
    return {
      type: "face",
      createdAt: new Date().toISOString(),
      features,
      scores,
      traditionalEvidence,
      metrics: state.faceMetrics,
      faceOrientation: state.faceMetrics ? state.faceMetrics.faceOrientation || null : null,
      coverage,
      matrix,
      recognitionReadiness: readiness,
      recognitionFallback: fallbackPlan,
      similarCases,
      similarCaseCalibration: similarCalibration,
      shotChecklist: checklist,
      shotGuide: shotGuideSnapshot("face", checklist),
      nextShotPlan: nextShotPlan("face", coverage, matrix, zoneAnnotations),
      manualRegions: Array.from(state.manualRegions.face),
      modelRegions: Array.from(state.modelRegions.face),
      modelEndpoint: modelEndpointSnapshot(),
      zoneAnnotations,
      geometryTrainingProfile: geometryTrainingProfile("face"),
      geometryCorrections: state.geometryCorrections.face,
      faceProportions: faceProportionProfile(state.faceSamples),
      experienceProfile: experience,
      sourceEvidence: sourceEvidenceSnapshot("face", activeRules),
      modelResults: modelResultsForMode("face"),
      routeLearning: routeLearningData("face"),
      routeCalibration: routeCalibrationSnapshot(),
      feedback: currentFeedback(),
      samples: state.faceSamples.map(sampleForExport),
      boundaries: ["traditional_reference_only", "rule_sources_are_tiered", "unreviewed_semantics_do_not_generate_scores", "no_medical_diagnosis", "no_death_year_prediction"]
    };
  }

  function baziExportPayload() {
    const dateInput = $("#birth-datetime").value;
    const date = readBirthDate();
    const dayPillar = $("#day-pillar").value.trim();
    const pillars = estimatePillars(date, dayPillar);
    const timelineRange = timelineRangeFromInputs(date);
    const personalActive = personalProfileModeIsActive("bazi") && state.personalProfileData;
    const chartContext = requireBaziRuntime().buildChartContext(date, $("#birth-gender").value, personalActive ? { data: state.personalProfileData, seed: personalProfileSeed } : null);
    return {
      type: "bazi",
      createdAt: new Date().toISOString(),
      birth: {
        datetime: dateInput,
        place: $("#birth-place").value,
        gender: $("#birth-gender").value
      },
      pillars,
      chartContext,
      dayPillarNeedsReview: !pillars.exact && !dayPillar,
      focuses: checkedValues("bazi-focuses"),
      runtime: baziRuntimeSnapshot(),
      sourceEvidence: sourceEvidenceSnapshot("bazi", []),
      timelineRange,
      timeline: baziTimeline(date.getFullYear(), pillars, timelineRange, chartContext),
      feedback: currentFeedback(),
      boundaries: ["solar_term_exact_runtime", "traditional_reference_only", "rule_sources_are_tiered", "no_death_year_prediction"]
    };
  }

  function loadCaseLibrary() {
    if (state.caseLibraryLoadPromise) return state.caseLibraryLoadPromise;
    state.caseLibraryIndex = caseStorageAdapter ? caseStorageAdapter.readIndex() : [];
    state.caseStorage = {
      ...state.caseStorage,
      backend: caseStorageAdapter ? "indexeddb" : "localstorage",
      status: "loading",
      indexCount: state.caseLibraryIndex.length,
      error: ""
    };
    renderCaseStorageStatus();
    state.caseLibraryLoadPromise = (async () => {
      const result = caseStorageAdapter
        ? await caseStorageAdapter.load()
        : legacyCaseLibraryResult("adapter_unavailable");
      state.caseLibrary = sortCaseItems((Array.isArray(result.cases) ? result.cases : [])
        .map((item, index) => normalizeCaseItem(item, `case-${index}`)))
        .slice(0, caseLibraryMaxCases);
      state.caseLibraryTotalCount = Number(result.caseCount || state.caseLibrary.length);
      state.caseLibraryFullyLoaded = Boolean(result.fullyLoaded || state.caseLibrary.length >= state.caseLibraryTotalCount);
      state.caseLibraryIndex = Array.isArray(result.index) ? result.index : [];
      state.caseStorage = caseStorageStateFromResult(result);
      state.caseLibraryVisibleCount = caseLibraryInitialRenderLimit;
      invalidateDerivedData();
      if (state.caseStorage.backend === "localstorage" && caseLibraryNeedsThumbnailCompaction(state.caseLibrary)) {
        scheduleCaseLibraryCompaction();
      }
      renderCaseLibrary();
      if (state.renderedReports.palm) renderPalmReport();
      if (state.renderedReports.face) renderFaceReport();
      scheduleVisibleCaseAssetHydration();
      scheduleCaseLibraryBackgroundLoad();
      schedulePersonalMasterSeed();
      return state.caseLibrary;
    })().catch((error) => {
      const fallback = legacyCaseLibraryResult(shortError(error));
      state.caseLibrary = sortCaseItems(fallback.cases.map((item, index) => normalizeCaseItem(item, `case-${index}`)));
      state.caseLibraryTotalCount = state.caseLibrary.length;
      state.caseLibraryFullyLoaded = true;
      state.caseLibraryIndex = fallback.index;
      state.caseStorage = caseStorageStateFromResult(fallback);
      invalidateDerivedData();
      renderCaseLibrary();
      if (state.renderedReports.palm) renderPalmReport();
      if (state.renderedReports.face) renderFaceReport();
      schedulePersonalMasterSeed();
      return state.caseLibrary;
    });
    return state.caseLibraryLoadPromise;
  }

  function ensureCaseLibraryLoaded() {
    return state.caseLibraryLoadPromise || loadCaseLibrary();
  }

  async function ensureFullCaseLibraryLoaded() {
    await ensureCaseLibraryLoaded();
    while (!state.caseLibraryFullyLoaded) {
      const before = state.caseLibrary.length;
      await loadNextCaseLibraryPage({ render: false });
      if (state.caseLibrary.length <= before && !state.caseLibraryFullyLoaded) {
        throw new Error("case_library_pagination_stalled");
      }
    }
    await ensurePersonalMasterCases({ persist: true });
    refreshCaseLibraryViews();
    return state.caseLibrary;
  }

  function scheduleCaseLibraryBackgroundLoad() {
    if (state.caseLibraryFullyLoaded || state.caseStorage.backend !== "indexeddb" || state.caseLibraryBackgroundScheduled) return;
    state.caseLibraryBackgroundScheduled = true;
    const run = async () => {
      state.caseLibraryBackgroundScheduled = false;
      try {
        await loadNextCaseLibraryPage({ render: false });
      } catch (error) {
        state.caseStorage = { ...state.caseStorage, error: shortError(error) };
        renderCaseStorageStatus();
        return;
      }
      scheduleCaseLibraryBackgroundLoad();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1400 });
      return;
    }
    window.setTimeout(run, 450);
  }

  function loadNextCaseLibraryPage(options = {}) {
    if (state.caseLibraryFullyLoaded || !caseStorageAdapter || state.caseStorage.backend !== "indexeddb") {
      return Promise.resolve(state.caseLibrary);
    }
    if (state.caseLibraryPagePromise) return state.caseLibraryPagePromise;
    const task = (async () => {
      const offset = state.caseLibrary.length;
      const result = await caseStorageAdapter.loadPage(offset, caseLibraryPageSize);
      const incoming = (Array.isArray(result.cases) ? result.cases : [])
        .map((item, index) => normalizeCaseItem(item, `case-${offset + index}`));
      const byId = new Map(state.caseLibrary.map((item) => [String(item.id), item]));
      incoming.forEach((item) => byId.set(String(item.id), item));
      state.caseLibrary = sortCaseItems(Array.from(byId.values())).slice(0, caseLibraryMaxCases);
      state.caseLibraryTotalCount = Number(result.caseCount || state.caseLibrary.length);
      state.caseLibraryFullyLoaded = Boolean(result.fullyLoaded || state.caseLibrary.length >= state.caseLibraryTotalCount);
      state.caseStorage = {
        ...state.caseStorage,
        caseCount: state.caseLibraryTotalCount,
        loadedCaseCount: state.caseLibrary.length,
        fullyLoaded: state.caseLibraryFullyLoaded,
        pageSize: Number(result.limit || caseLibraryPageSize)
      };
      invalidateDerivedData();
      if (options.render === false && !state.caseLibraryFullyLoaded) {
        state.caseLibraryBackgroundDirty = true;
        renderCaseStorageStatus();
      } else {
        state.caseLibraryBackgroundDirty = false;
        refreshCaseLibraryViews();
      }
      if (state.caseLibraryFullyLoaded) schedulePersonalMasterSeed();
      return state.caseLibrary;
    })();
    state.caseLibraryPagePromise = task;
    return task.finally(() => {
      if (state.caseLibraryPagePromise === task) state.caseLibraryPagePromise = null;
    });
  }

  async function ensureCaseLibraryCount(requiredCount) {
    await ensureCaseLibraryLoaded();
    const target = Math.min(state.caseLibraryTotalCount, Math.max(0, Number(requiredCount || 0)));
    while (state.caseLibrary.length < target && !state.caseLibraryFullyLoaded) {
      await loadNextCaseLibraryPage();
    }
    return state.caseLibrary;
  }

  function legacyCaseLibraryResult(reason = "indexeddb_unavailable") {
    let cases = [];
    try {
      const raw = localStorage.getItem(caseStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      cases = Array.isArray(parsed) ? parsed.filter((item) => item && item.payload) : [];
    } catch (error) {
      cases = [];
    }
    const index = caseStorageAdapter
      ? caseStorageAdapter.writeIndex(cases)
      : cases.map((item) => ({ id: item.id, title: item.title, mode: item.mode, createdAt: item.createdAt }));
    return {
      cases,
      index,
      adapterVersion: caseStorageAdapter ? caseStorageAdapter.version : 0,
      backend: "localstorage",
      status: "degraded",
      migrated: false,
      caseCount: cases.length,
      loadedCaseCount: cases.length,
      fullyLoaded: true,
      pageSize: caseLibraryPageSize,
      indexCount: index.length,
      assetCount: 0,
      hydratedAssetCount: 0,
      imageStoreSeparate: false,
      error: reason
    };
  }

  function persistCaseLibrary() {
    state.caseLibraryPersistRequested = true;
    if (state.caseLibraryPersistPromise) return state.caseLibraryPersistPromise;
    state.caseLibraryPersistPromise = (async () => {
      while (state.caseLibraryPersistRequested) {
        state.caseLibraryPersistRequested = false;
        const cases = sortCaseItems(state.caseLibrary).slice(0, caseLibraryMaxCases);
        state.caseLibrary = cases;
        state.caseStorage = { ...state.caseStorage, status: "saving", caseCount: cases.length };
        renderCaseStorageStatus();
        if (caseStorageAdapter) {
          try {
            const result = await caseStorageAdapter.replace(cases);
            state.caseLibraryIndex = result.index;
            state.caseStorage = caseStorageStateFromResult(result);
            continue;
          } catch (error) {
            legacyPersistCaseLibrary(cases);
            state.caseLibraryIndex = caseStorageAdapter.writeIndex(cases);
            state.caseStorage = {
              ...state.caseStorage,
              backend: "localstorage",
              status: "degraded",
              caseCount: cases.length,
              indexCount: state.caseLibraryIndex.length,
              error: shortError(error)
            };
            continue;
          }
        }
        legacyPersistCaseLibrary(cases);
        state.caseStorage = {
          ...state.caseStorage,
          backend: "localstorage",
          status: "degraded",
          caseCount: cases.length,
          indexCount: cases.length,
          error: "adapter_unavailable"
        };
      }
    })().finally(() => {
      state.caseLibraryPersistPromise = null;
      renderCaseStorageStatus();
    });
    return state.caseLibraryPersistPromise;
  }

  function legacyPersistCaseLibrary(cases = state.caseLibrary) {
    const persistedCases = compactCaseLibraryThumbnails(cases, caseThumbnailPersistenceLimit);
    try {
      localStorage.setItem(caseStorageKey, JSON.stringify(persistedCases));
      return true;
    } catch (error) {
      const compact = compactCaseLibraryThumbnails(cases, Math.floor(caseThumbnailPersistenceLimit / 2));
      try {
        localStorage.setItem(caseStorageKey, JSON.stringify(compact));
        return true;
      } catch (fallbackError) {
        return false;
      }
    }
  }

  function caseStorageStateFromResult(result) {
    return {
      adapterVersion: Number(result && result.adapterVersion || caseStorageAdapter && caseStorageAdapter.version || 0),
      backend: result && result.backend === "indexeddb" ? "indexeddb" : "localstorage",
      status: result && result.status ? result.status : "ready",
      migrated: Boolean(result && result.migrated),
      caseCount: Number(result && result.caseCount || 0),
      loadedCaseCount: Number(result && result.loadedCaseCount || result && result.caseCount || 0),
      fullyLoaded: result && result.fullyLoaded !== undefined ? Boolean(result.fullyLoaded) : true,
      pageSize: Number(result && result.pageSize || caseLibraryPageSize),
      indexCount: Number(result && result.indexCount || 0),
      assetCount: Number(result && result.assetCount || 0),
      hydratedAssetCount: Number(result && result.hydratedAssetCount || 0),
      imageStoreSeparate: Boolean(result && result.imageStoreSeparate),
      error: result && result.error ? String(result.error) : ""
    };
  }

  function caseLibraryStorageSnapshot() {
    return {
      adapterVersion: Number(state.caseStorage.adapterVersion || 0),
      backend: state.caseStorage.backend,
      status: state.caseStorage.status,
      migrated: Boolean(state.caseStorage.migrated),
      caseCount: state.caseLibraryTotalCount || state.caseLibrary.length,
      loadedCaseCount: state.caseLibrary.length,
      fullyLoaded: state.caseLibraryFullyLoaded,
      pageSize: caseLibraryPageSize,
      indexCount: state.caseLibraryIndex.length,
      assetStore: state.caseStorage.imageStoreSeparate ? "caseAssets" : "embedded_compatibility",
      assetCount: Number(state.caseStorage.assetCount || 0),
      hydratedAssetCount: Number(state.caseStorage.hydratedAssetCount || 0),
      imageStoreSeparate: Boolean(state.caseStorage.imageStoreSeparate),
      fullPayloadInIndex: false,
      legacyKeyRetained: true,
      error: state.caseStorage.error || ""
    };
  }

  function renderCaseStorageStatus() {
    const target = $("#case-storage-status");
    if (!target) return;
    const storage = state.caseStorage;
    if (storage.status === "loading") {
      target.textContent = storage.indexCount ? `索引 ${storage.indexCount} · 完整库载入中` : "完整案例库载入中";
      return;
    }
    if (storage.status === "saving") {
      target.textContent = `${storage.backend === "indexeddb" ? "IndexedDB" : "兼容存储"}保存中`;
      return;
    }
    if (storage.backend === "indexeddb") {
      const paging = storage.fullyLoaded === false
        ? ` · 案例 ${storage.loadedCaseCount}/${storage.caseCount}`
        : "";
      target.textContent = `IndexedDB${paging} · 图片按需${storage.migrated ? " · 已迁移" : ""}`;
      return;
    }
    target.textContent = "兼容存储";
  }

  function compactCaseLibraryThumbnails(cases, keepThumbnailCases = 60) {
    return (Array.isArray(cases) ? cases : []).map((item, index) => {
      if (index < keepThumbnailCases) return item;
      const payload = item && item.payload ? {
        ...item.payload,
        samples: Array.isArray(item.payload.samples)
          ? item.payload.samples.map((sample) => ({ ...sample, thumbnail: null }))
          : item.payload.samples
      } : item.payload;
      return {
        ...item,
        thumbnails: [],
        payload
      };
    });
  }

  function caseLibraryNeedsThumbnailCompaction(cases) {
    return (Array.isArray(cases) ? cases : []).slice(caseThumbnailPersistenceLimit).some((item) => {
      if (Array.isArray(item && item.thumbnails) && item.thumbnails.length) return true;
      return Boolean(item && item.payload && Array.isArray(item.payload.samples) && item.payload.samples.some((sample) => sample && sample.thumbnail));
    });
  }

  function scheduleCaseLibraryCompaction() {
    if (state.caseStorage.backend !== "localstorage") return;
    const compact = () => legacyPersistCaseLibrary();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(compact, { timeout: 1800 });
      return;
    }
    window.setTimeout(compact, 500);
  }

  function refreshCaseLibraryViews() {
    renderCaseLibrary();
    if (state.renderedReports.palm) renderPalmReport();
    if (state.renderedReports.face) renderFaceReport();
  }

  function scheduleVisibleCaseAssetHydration() {
    if (state.caseAssetHydrationScheduled || state.caseStorage.backend !== "indexeddb") return;
    const visibleCount = Math.min(
      state.caseLibrary.length,
      Math.max(caseLibraryInitialRenderLimit, state.caseLibraryVisibleCount || 0)
    );
    const pending = filteredCaseLibrary().slice(0, visibleCount)
      .filter((item) => item && item.assetRef && !state.caseAssetsRequested.has(String(item.id)));
    if (!pending.length) return;
    state.caseAssetHydrationScheduled = true;
    const run = async () => {
      state.caseAssetHydrationScheduled = false;
      await hydrateCaseAssets(pending);
      refreshCaseLibraryViews();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 900 });
      return;
    }
    window.setTimeout(run, 300);
  }

  function hydrateCaseAssets(cases = state.caseLibrary) {
    if (!caseStorageAdapter || state.caseStorage.backend !== "indexeddb") {
      return Promise.resolve(state.caseLibrary);
    }
    const previous = state.caseAssetLoadPromise || Promise.resolve();
    const task = previous.catch(() => undefined).then(async () => {
      const requestedCases = Array.isArray(cases) ? cases : [];
      const caseIds = requestedCases
        .filter((item) => item && item.assetRef && !state.caseAssetsRequested.has(String(item.id)))
        .map((item) => String(item.id));
      if (!caseIds.length) return state.caseLibrary;
      caseIds.forEach((caseId) => state.caseAssetsRequested.add(caseId));
      try {
        const assets = await caseStorageAdapter.loadAssets(caseIds);
        state.caseLibrary = caseStorageAdapter.hydrateCases(state.caseLibrary, assets);
        assets.forEach((asset) => {
          if (asset && asset.caseId) state.caseAssetsLoaded.add(String(asset.caseId));
        });
        state.caseStorage = {
          ...state.caseStorage,
          hydratedAssetCount: state.caseAssetsLoaded.size
        };
        return state.caseLibrary;
      } catch (error) {
        caseIds.forEach((caseId) => state.caseAssetsRequested.delete(caseId));
        state.caseStorage = { ...state.caseStorage, error: shortError(error) };
        return state.caseLibrary;
      }
    });
    state.caseAssetLoadPromise = task;
    return task.finally(() => {
      if (state.caseAssetLoadPromise === task) state.caseAssetLoadPromise = null;
    });
  }

  async function hydrateAllCaseAssets() {
    if (!caseStorageAdapter || state.caseStorage.backend !== "indexeddb") return state.caseLibrary;
    try {
      const assets = await caseStorageAdapter.loadAssets();
      state.caseLibrary = caseStorageAdapter.hydrateCases(state.caseLibrary, assets);
      assets.forEach((asset) => {
        if (asset && asset.caseId) {
          state.caseAssetsLoaded.add(String(asset.caseId));
          state.caseAssetsRequested.add(String(asset.caseId));
        }
      });
      state.caseStorage = {
        ...state.caseStorage,
        hydratedAssetCount: state.caseAssetsLoaded.size
      };
    } catch (error) {
      state.caseStorage = { ...state.caseStorage, error: shortError(error) };
    }
    return state.caseLibrary;
  }

  function saveCase(mode) {
    state.caseSavePromise = state.caseSavePromise
      .catch(() => undefined)
      .then(() => saveCaseNow(mode));
    return state.caseSavePromise;
  }

  async function saveCaseNow(mode) {
    await ensureFullCaseLibraryLoaded();
    if (mode === "bazi") await ensureBaziRuntime();
    if (mode === "palm" || mode === "face") await ensureTraditionalRules();
    const payload = mode === "palm"
      ? palmExportPayload()
      : mode === "face"
        ? faceExportPayload()
        : baziExportPayload();
    const feedback = currentFeedback();
    payload.feedback = feedback;
    const title = caseTitle(payload);
    state.caseLibrary.unshift({
      id: uniqueCaseId(mode),
      title,
      mode,
      createdAt: new Date().toISOString(),
      feedback,
      thumbnails: caseThumbnailsFromPayload(payload),
      payload
    });
    state.caseLibrary = sortCaseItems(state.caseLibrary).slice(0, caseLibraryMaxCases);
    state.caseLibraryTotalCount = state.caseLibrary.length;
    state.caseLibraryFullyLoaded = true;
    invalidateDerivedData();
    renderCaseLibrary();
    if (mode === "palm") renderPalmReport();
    if (mode === "face") renderFaceReport();
    await persistCaseLibrary();
  }

  function uniqueCaseId(mode) {
    state.caseIdSequence += 1;
    const suffix = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${state.caseIdSequence}-${Math.random().toString(36).slice(2, 10)}`;
    return `${mode}-${Date.now()}-${suffix}`;
  }

  function caseTitle(payload) {
    if (payload.type === "bazi") {
      return `八字 ${payload.birth.datetime || "未填时间"}`;
    }
    const count = payload.samples ? payload.samples.length : 0;
    const quality = payload.coverage ? percent(payload.coverage.quality) : "--";
    return `${payload.type === "palm" ? "手相" : "面相"} ${count}张样本 置信${quality}`;
  }

  function caseThumbnailsFromPayload(payload) {
    if (!payload || !["palm", "face"].includes(payload.type) || !Array.isArray(payload.samples)) return [];
    return payload.samples
      .map((sample) => {
        const thumbnail = sample && sample.thumbnail ? sample.thumbnail : null;
        const dataUrl = thumbnail ? safeThumbnailDataUrl(thumbnail.dataUrl) : "";
        if (!dataUrl) return null;
        return {
          dataUrl,
          width: thumbnail.width || null,
          height: thumbnail.height || null,
          source: thumbnail.source || "",
          capturedAt: thumbnail.capturedAt || "",
          sampleName: sample.name || "",
          sampleType: sample.type || "",
          label: sample.label || sampleTypeLabel(payload.type, sample.type),
          quality: sample.quality ?? null
        };
      })
      .filter(Boolean)
      .slice(0, 8);
  }

  function safeThumbnailDataUrl(value) {
    const text = typeof value === "string" ? value : "";
    return /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(text) ? text : "";
  }

  function caseThumbnailStrip(item) {
    const thumbnails = Array.isArray(item.thumbnails) && item.thumbnails.length
      ? item.thumbnails
      : caseThumbnailsFromPayload(item.payload);
    const safeThumbnails = thumbnails
      .map((thumb) => ({ ...thumb, dataUrl: safeThumbnailDataUrl(thumb.dataUrl) }))
      .filter((thumb) => thumb.dataUrl);
    const personalThumbnails = item && item.payload && Array.isArray(item.payload.samples)
      ? item.payload.samples
        .map((sample) => ({
          source: safePersonalAssetUrl(sample && sample.personalAssetUrl),
          label: sample && (sample.label || sample.name) || "本人样本"
        }))
        .filter((thumb) => thumb.source)
      : [];
    const renderedThumbnails = [
      ...personalThumbnails.map((thumb) => ({ source: thumb.source, label: thumb.label })),
      ...safeThumbnails.map((thumb) => ({ source: thumb.dataUrl, label: thumb.label || "案例缩略图" }))
    ].slice(0, caseThumbnailRenderLimit);
    if (!renderedThumbnails.length) return "";
    return `
      <div class="case-thumbnail-strip">
        ${renderedThumbnails.map((thumb) => `
          <span class="case-thumbnail">
            <img src="${escapeHtml(thumb.source)}" alt="${escapeHtml(thumb.label)}" loading="lazy" decoding="async">
          </span>
        `).join("")}
      </div>
    `;
  }

  function renderCaseLibrary() {
    const loading = state.caseStorage.status === "loading";
    const indexedCount = state.caseLibraryIndex.length;
    const totalLibraryCount = state.caseLibraryTotalCount || indexedCount || state.caseLibrary.length;
    const filter = $("#case-evidence-filter").value;
    const filteredCases = filteredCaseLibrary(filter);
    const visibleCount = Math.min(filteredCases.length, Math.max(caseLibraryInitialRenderLimit, state.caseLibraryVisibleCount || 0));
    const visibleCases = filteredCases.slice(0, visibleCount);
    const hiddenCount = Math.max(0, (filter === "all" ? totalLibraryCount : filteredCases.length) - visibleCases.length);
    const totalCount = loading && !state.caseLibrary.length ? Math.max(indexedCount, totalLibraryCount) : totalLibraryCount;
    const personalCount = state.caseLibrary.filter(isPersonalMasterCase).length;
    const ordinaryCount = Math.max(0, totalCount - personalCount);
    const eligibleCount = state.caseLibrary.filter((item) => !isPersonalMasterCase(item) && caseTraditionalLearningEligible(item)).length;
    $("#case-evidence-count").textContent = `传统已复核 ${eligibleCount} · 仅照片/几何 ${Math.max(0, ordinaryCount - eligibleCount)}`;
    $("#case-count").textContent = loading && !state.caseLibrary.length
      ? `${totalCount} 个案例 · 载入中`
      : `${personalCount} 个本人主档 · ${ordinaryCount} 个普通案例 · 显示 ${visibleCases.length}`;
    renderCaseStorageStatus();
    if (loading && !state.caseLibrary.length) {
      $("#learning-summary").textContent = "完整案例载入后更新经验学习、相似案例和几何训练。";
    } else if (!state.caseLibraryFullyLoaded) {
      $("#learning-summary").textContent = `经验库正在后台整理 ${state.caseLibrary.length}/${totalLibraryCount}；补齐前不应用历史经验调分。`;
    } else {
      setHtml($("#learning-summary"), learningSummary());
    }
    renderGeometryTrainingPanel();
    const target = $("#case-list");
    if (loading && !state.caseLibrary.length) {
      target.textContent = indexedCount ? `正在后台载入 ${indexedCount} 个完整案例` : "正在准备完整案例库";
      return;
    }
    if (!filteredCases.length) {
      target.textContent = state.caseLibrary.length ? "筛选无案例" : "还没有保存案例";
      return;
    }
    setHtml(target, `${visibleCases.map((item) => `
      <div class="case-item${isPersonalMasterCase(item) ? " personal-master-case" : ""}">
        <div>
          ${caseThumbnailStrip(item)}
          <strong>${escapeHtml(item.title)}${isPersonalMasterCase(item) ? ' <span class="tag green">本人置顶</span>' : ""}</strong>
          <div class="case-meta">${item.mode.toUpperCase()} · ${formatIsoTime(item.updatedAt || item.createdAt)}</div>
          ${isPersonalMasterCase(item) ? `<div class="case-meta personal-history-depth">${escapeHtml(personalHistoryDepthText(item.payload))}</div>` : ""}
          ${caseFeedbackNote(item)}
        </div>
        <div class="case-actions">
          <span class="pill">${caseSummary(item.payload, item)}</span>
          <span class="pill">${isPersonalMasterCase(item) ? item.payload && item.payload.detailLevel === "maximum" ? "最高详情" : "详情按需" : feedbackLabel(caseFeedback(item).rating)}</span>
          ${isPersonalMasterCase(item) ? `<button class="secondary-action compact-action" type="button" data-personal-profile-open="${escapeHtml(item.mode)}">打开完整档案</button>` : ""}
        </div>
      </div>
    `).join("")}${hiddenCount ? `
      <div class="training-more">
        还有 ${hiddenCount} 个案例已折叠或正在后台整理，完整案例仍保留在本地库和整库导出中。
        <button class="secondary-action compact-action" type="button" data-case-library-more>再显示 ${Math.min(caseLibraryRenderStep, hiddenCount)} 个</button>
      </div>
    ` : ""}`);
  }

  function filteredCaseLibrary(filter = $("#case-evidence-filter").value) {
    return sortCaseItems(state.caseLibrary).filter((item) => caseEvidenceRuntime.matches(item, filter, isPersonalMasterCase(item)));
  }

  async function showMoreCaseLibrary() {
    const nextVisibleCount = Math.min(
      state.caseLibraryTotalCount || state.caseLibrary.length,
      Math.max(caseLibraryInitialRenderLimit, state.caseLibraryVisibleCount || 0) + caseLibraryRenderStep
    );
    await ensureCaseLibraryCount(nextVisibleCount);
    state.caseLibraryVisibleCount = nextVisibleCount;
    await hydrateCaseAssets(filteredCaseLibrary().slice(0, state.caseLibraryVisibleCount));
    renderCaseLibrary();
  }

  function caseSummary(payload, item = null) {
    if (isPersonalMasterCase(item) || payload && payload.personalProfile && payload.personalProfile.isMaster) {
      if (payload.detailLevel !== "maximum") return "本人主档 · 按需展开";
      if (payload.type === "bazi") return `${Array.isArray(payload.timeline) ? payload.timeline.length : 101}年完整档案`;
      return `本人最高详情 · ${Array.isArray(payload.samples) ? payload.samples.length : 0}张`;
    }
    if (payload.type === "bazi") return payload.dayPillarNeedsReview ? "日柱待复核" : "四柱已填";
    const ready = payload.matrix ? payload.matrix.filter((item) => item.status === "ready").length : 0;
    const total = payload.matrix ? payload.matrix.length : 0;
    return `${ready}/${total} 可判断${caseTraditionalLearningEligible(item || { payload, mode: payload.type }) ? "" : " · 传统未复核"}`;
  }

  function currentFeedback() {
    const rating = $("#case-feedback-rating") ? $("#case-feedback-rating").value : "unreviewed";
    const note = $("#case-feedback-note") ? $("#case-feedback-note").value.trim() : "";
    return normalizeFeedback({ rating, note });
  }

  function normalizeFeedback(feedback) {
    const rating = feedback && feedbackRatingLabels[feedback.rating] ? feedback.rating : "unreviewed";
    const note = feedback && feedback.note ? String(feedback.note).trim() : "";
    return {
      rating,
      label: feedbackLabel(rating),
      note
    };
  }

  function feedbackLabel(rating) {
    return feedbackRatingLabels[rating] || feedbackRatingLabels.unreviewed;
  }

  function caseFeedback(item) {
    return normalizeFeedback(item.feedback || (item.payload && item.payload.feedback));
  }

  function caseFeedbackNote(item) {
    const feedback = caseFeedback(item);
    if (!feedback.note) return "";
    return `<div class="case-feedback-note">${escapeHtml(feedback.note)}</div>`;
  }

  function learningSummaryData() {
    const ordinaryCases = state.caseLibrary.filter((item) => !isPersonalMasterCase(item));
    const summary = {
      total: ordinaryCases.length,
      personalMasters: state.caseLibrary.length - ordinaryCases.length,
      reviewed: 0,
      accurate: 0,
      partial: 0,
      wrong: 0,
      unreviewed: 0,
      traditionalEligible: 0,
      byMode: { palm: 0, face: 0, bazi: 0 },
      routeCorrections: routeCorrectionSummary(),
      routeCalibration: routeCalibrationSnapshot()
    };
    for (const item of ordinaryCases) {
      const mode = item.mode || (item.payload && item.payload.type);
      if (summary.byMode[mode] !== undefined) summary.byMode[mode] += 1;
      if (["palm", "face"].includes(mode) && caseTraditionalLearningEligible(item)) summary.traditionalEligible += 1;
      const rating = caseFeedback(item).rating;
      summary[rating] += 1;
      if (rating !== "unreviewed") summary.reviewed += 1;
    }
    summary.accurateRate = summary.reviewed ? Math.round((summary.accurate / summary.reviewed) * 100) : null;
    summary.experienceProfiles = {
      palm: experienceProfile("palm"),
      face: experienceProfile("face")
    };
    return summary;
  }

  function learningSummary() {
    const summary = learningSummaryData();
    const rate = summary.accurateRate === null ? "等待验证" : `${summary.accurateRate}% 明确准确`;
    const palmExp = summary.experienceProfiles.palm;
    const faceExp = summary.experienceProfiles.face;
    const palmRate = palmExp.accurateRate === null ? "待验证" : `${palmExp.accurateRate}%`;
    const faceRate = faceExp.accurateRate === null ? "待验证" : `${faceExp.accurateRate}%`;
    return `
      <div class="learning-line">
        <span><b>${summary.total}</b> 总样本</span>
        <span><b>${summary.reviewed}</b> 已验证</span>
        <span><b>${summary.accurate}</b> 准确</span>
        <span><b>${summary.partial}</b> 部分准确</span>
        <span><b>${summary.wrong}</b> 不准确</span>
      </div>
      <div class="case-meta">本人主档 ${summary.personalMasters} 条固定置顶，不进入普通案例准确率和相似案例自校准。</div>
      <div class="case-meta">手相 ${summary.byMode.palm} · 面相 ${summary.byMode.face} · 八字 ${summary.byMode.bazi} · ${rate}</div>
      <div class="case-meta">传统学习合格 ${summary.traditionalEligible} 条；仅照片/几何案例不参与趋势分和相似校准。</div>
      <div class="case-meta">经验层：手相 ${palmRate} / ${experienceAdjustmentLabel(palmExp)} · 面相 ${faceRate} / ${experienceAdjustmentLabel(faceExp)}</div>
      <div class="case-meta">通用分流：${summary.routeCorrections.total} 条，人工纠正 ${summary.routeCorrections.manualCorrected} 条，原生改流 ${summary.routeCorrections.nativeCorrected} 条，本地校准 手${signedPercent(summary.routeCalibration.palmBias)} / 面${signedPercent(summary.routeCalibration.faceBias)}</div>
    `;
  }

  function geometryTrainingDataset() {
    if (
      derivedDataCache.geometryDataset &&
      derivedDataCache.geometryDatasetRevision === derivedDataCache.revision
    ) {
      return derivedDataCache.geometryDataset;
    }
    const currentFeedbackValue = currentFeedback();
    const currentItems = [
      ...geometryTrainingItemsFromSamples("palm", state.palmSamples, {
        source: "current_session",
        feedback: currentFeedbackValue
      }),
      ...creaseEditTrainingItemsFromSamples("palm", state.palmSamples, {
        source: "current_session",
        feedback: currentFeedbackValue
      }),
      ...creaseSemanticTrainingItemsFromSamples("palm", state.palmSamples, {
        source: "current_session",
        feedback: currentFeedbackValue
      }),
      ...geometryTrainingItemsFromSamples("face", state.faceSamples, {
        source: "current_session",
        feedback: currentFeedbackValue
      }),
      ...faceObservationRuntime.trainingItems(modeAnalysisSamples(state.faceSamples), {
        source: "current_session",
        feedback: currentFeedbackValue
      })
    ];
    const caseItems = state.caseLibrary.flatMap((item) => geometryTrainingItemsFromCase(item));
    const libraryItems = state.geometryTrainingLibrary.map((item, index) => normalizeGeometryTrainingLibraryItem(item, index)).filter(Boolean);
    const items = mergeGeometryTrainingItems([...currentItems, ...caseItems, ...libraryItems]);
    const dataset = {
      type: "geometry_training_dataset",
      version: 2,
      exportedAt: new Date().toISOString(),
      summary: geometryTrainingSummary(items),
      items,
      boundaries: ["no_raw_image_payload", "manual_corrections_only", "semantic_truth_requires_two_stage_manual_review", "traditional_reference_only"]
    };
    derivedDataCache.geometryDataset = dataset;
    derivedDataCache.geometryDatasetRevision = derivedDataCache.revision;
    derivedDataCache.geometryProfiles.clear();
    return dataset;
  }

  function loadGeometryTrainingLibrary() {
    try {
      const raw = localStorage.getItem(geometryTrainingStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const items = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.items)
          ? parsed.items
          : [];
      state.geometryTrainingLibrary = mergeGeometryTrainingItems(items.map(normalizeGeometryTrainingLibraryItem).filter(Boolean)).slice(0, 1000);
    } catch (error) {
      state.geometryTrainingLibrary = [];
    }
    state.geometryTrainingLibraryLoaded = true;
    invalidateDerivedData();
  }

  function scheduleGeometryTrainingLibraryLoad() {
    if (state.geometryTrainingLibraryLoaded || state.geometryTrainingLibraryScheduled) return;
    state.geometryTrainingLibraryScheduled = true;
    const run = () => {
      state.geometryTrainingLibraryScheduled = false;
      loadGeometryTrainingLibrary();
      renderGeometryTrainingPanel();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1000 });
      return;
    }
    window.setTimeout(run, 250);
  }

  function persistGeometryTrainingLibrary() {
    try {
      localStorage.setItem(geometryTrainingStorageKey, JSON.stringify(state.geometryTrainingLibrary));
    } catch (error) {
    }
  }

  function geometryTrainingItemsFromCase(item) {
    const payload = item && item.payload ? item.payload : null;
    if (!payload || !["palm", "face"].includes(payload.type)) return [];
    return geometryTrainingItemsFromPayload(payload, {
      source: "case_library",
      caseId: item.id,
      caseTitle: item.title,
      caseCreatedAt: item.createdAt,
      feedback: caseFeedback(item)
    });
  }

  function geometryTrainingItemsFromPayload(payload, context) {
    const samples = Array.isArray(payload.samples) ? payload.samples : [];
    const items = [
      ...geometryTrainingItemsFromSamples(payload.type, samples, context),
      ...creaseEditTrainingItemsFromSamples(payload.type, samples, context),
      ...creaseSemanticTrainingItemsFromSamples(payload.type, samples, context),
      ...faceObservationRuntime.trainingItems(payload.type === "face" ? modeAnalysisSamples(samples) : [], context)
    ];
    const seen = new Set(items.map((item) => item.correctionKey));
    const looseCorrections = Array.isArray(payload.geometryCorrections) ? payload.geometryCorrections : [];
    looseCorrections.forEach((correction, index) => {
      const key = geometryCorrectionKey(correction, index);
      if (seen.has(key)) return;
      const sample = samples.find((item) => item.name === correction.sampleName || item.id === correction.sampleId) || {};
      items.push(geometryTrainingItem(payload.type, sample, correction, index, context));
      seen.add(key);
    });
    return items;
  }

  function geometryTrainingItemsFromSamples(mode, samples, context) {
    return modeAnalysisSamples(samples).flatMap((sample) => {
      const corrections = Array.isArray(sample.geometryCorrections) ? sample.geometryCorrections : [];
      return corrections.map((correction, index) => geometryTrainingItem(mode, sample, correction, index, context));
    });
  }

  function creaseEditTrainingItemsFromSamples(mode, samples, context = {}) {
    if (mode !== "palm") return [];
    return modeAnalysisSamples(samples).flatMap((sample) => {
      const edits = Array.isArray(sample.creaseGeometryEdits) ? sample.creaseGeometryEdits : [];
      return edits.map((edit, index) => creaseEditTrainingItem(sample, edit, index, context));
    });
  }

  function creaseSemanticTrainingItemsFromSamples(mode, samples, context = {}) {
    if (mode !== "palm") return [];
    return modeAnalysisSamples(samples).flatMap((sample) => {
      const polylines = sample && sample.modelResult && Array.isArray(sample.modelResult.creasePolylines)
        ? sample.modelResult.creasePolylines
        : [];
      return polylines.map((polyline) => creaseSemanticTrainingItem(sample, polyline, context)).filter(Boolean);
    });
  }

  function creaseSemanticTrainingItem(sample, polyline, context = {}) {
    const review = normalizeCreaseSemanticReview(polyline);
    if (!sample || !polyline || polyline.reviewStatus !== "accepted" || review.status !== "confirmed") return null;
    const provenance = normalizeSampleProvenance(sample.sampleProvenance);
    return {
      id: `${context.source || "session"}:palm:${sample.name || "sample"}:semantic:${polyline.key}:${review.candidateKey}`,
      correctionKey: `semantic|${polyline.key}|${review.candidateKey}|${review.confirmedAt || "confirmed"}`,
      source: context.source || "current_session",
      mode: "palm",
      caseId: context.caseId || null,
      caseTitle: context.caseTitle || null,
      caseCreatedAt: context.caseCreatedAt || null,
      sampleName: sample.name || "",
      sampleType: sample.type || "",
      suggestedType: sample.suggestedType || "",
      quality: sample.quality ?? null,
      modelVersion: sample.modelVersion || "",
      targetKind: "polyline_semantic",
      targetKey: review.candidateKey,
      endpoint: null,
      before: null,
      after: null,
      correctedAt: review.confirmedAt || null,
      reviewStatus: "accepted",
      reviewedAt: review.confirmedAt || null,
      feedback: normalizeFeedback(context.feedback),
      sampleProvenance: provenance,
      subjectKey: provenance.subjectKey || null,
      independenceEligible: provenance.independenceEligible,
      targetSnapshot: {
        polylineKey: polyline.key,
        points: boundedPolylinePoints(polyline.points, 48),
        bounds: polyline.bounds || polylineBoundsFromPoints(polyline.points),
        orientation: polyline.orientation || polylineOrientationFromPoints(polyline.points),
        geometrySource: polyline.geometrySource || polyline.source || "",
        semanticKey: review.candidateKey,
        semanticStatus: "manual_confirmed",
        reviewRounds: 2,
        taxonomyVersion: review.taxonomyVersion,
        sourceRefs: review.sourceRefs,
        geometrySuggestion:palmSemanticRuntime.snapshot(polyline.semanticSuggestion,review.candidateKey),
        namingAllowed: true
      },
      boundaries: review.boundaries
    };
  }

  function creaseEditTrainingItem(sample, edit, index, context = {}) {
    const operation = edit && edit.operation === "reconnect" ? "reconnect" : "split";
    const correctionKey = edit && edit.id ? edit.id : `crease_edit_${index}`;
    const provenance = normalizeSampleProvenance(sample.sampleProvenance);
    return {
      id: `${context.source || "session"}:palm:${sample.name || "sample"}:${correctionKey}`,
      correctionKey,
      source: context.source || "current_session",
      mode: "palm",
      caseId: context.caseId || null,
      caseTitle: context.caseTitle || null,
      caseCreatedAt: context.caseCreatedAt || null,
      sampleName: sample.name || edit.sampleName || "",
      sampleType: sample.type || "",
      suggestedType: sample.suggestedType || "",
      quality: sample.quality ?? null,
      modelVersion: edit.modelVersion || sample.modelVersion || "",
      targetKind: "polyline_operation",
      targetKey: operation,
      operation,
      endpoint: null,
      before: null,
      after: null,
      correctedAt: edit.correctedAt || null,
      reviewStatus: edit.undoneAt || edit.replayStatus ? "disabled" : "accepted",
      reviewedAt: edit.undoneAt || edit.correctedAt || null,
      feedback: normalizeFeedback(context.feedback),
      sampleProvenance: provenance,
      subjectKey: provenance.subjectKey || null,
      independenceEligible: provenance.independenceEligible,
      targetSnapshot: {
        beforeKeys: Array.isArray(edit.beforeKeys) ? edit.beforeKeys : [],
        afterKeys: Array.isArray(edit.afterKeys) ? edit.afterKeys : [],
        splitPointIndex: Number.isInteger(edit.splitPointIndex) ? edit.splitPointIndex : null,
        metrics: edit.metrics || null,
        semanticStatus: "unclassified",
        namingAllowed: false
      }
    };
  }

  function geometryTrainingItem(mode, sample, correction, index, context = {}) {
    const targetSnapshot = geometryTargetSnapshot(sample.modelResult, correction);
    const correctionKey = geometryCorrectionKey(correction, index);
    const provenance = normalizeSampleProvenance(sample.sampleProvenance);
    return {
      id: `${context.source || "session"}:${mode}:${sample.name || correction.sampleName || "sample"}:${correctionKey}`,
      correctionKey,
      source: context.source || "current_session",
      mode,
      caseId: context.caseId || null,
      caseTitle: context.caseTitle || null,
      caseCreatedAt: context.caseCreatedAt || null,
      sampleName: sample.name || correction.sampleName || "",
      sampleType: sample.type || "",
      suggestedType: sample.suggestedType || "",
      quality: sample.quality ?? null,
      modelVersion: correction.modelVersion || sample.modelVersion || "",
      targetKind: correction.targetKind || "",
      targetKey: correction.targetKey || "",
      endpoint: correction.endpoint || null,
      before: correction.before || null,
      after: correction.after || null,
      correctedAt: correction.correctedAt || null,
      reviewStatus: normalizeGeometryTrainingReviewStatus(context.reviewStatus || correction.reviewStatus || sample.reviewStatus),
      reviewedAt: context.reviewedAt || correction.reviewedAt || null,
      feedback: normalizeFeedback(context.feedback),
      sampleProvenance: provenance,
      subjectKey: provenance.subjectKey || null,
      independenceEligible: provenance.independenceEligible,
      targetSnapshot,
      routeEvidence: sample.routeEvidence || null
    };
  }

  function normalizeGeometryTrainingLibraryItem(item, index = 0) {
    const normalized = normalizeGeometryTrainingItem(item, index);
    if (!normalized) return null;
    return {
      ...normalized,
      id: normalized.id || `training_library:${normalized.mode}:${normalized.correctionKey}`,
      source: "training_library",
      originalSource: item.originalSource || item.source || "imported",
      importedAt: item.importedAt || new Date().toISOString(),
      reviewStatus: normalizeGeometryTrainingReviewStatus(item.reviewStatus || normalized.reviewStatus),
      reviewedAt: item.reviewedAt || normalized.reviewedAt || null,
      boundaries: Array.isArray(item.boundaries) ? item.boundaries : []
    };
  }

  function normalizeGeometryTrainingItem(item, index = 0) {
    if (!item || typeof item !== "object") return null;
    const mode = item.mode === "face" ? "face" : item.mode === "palm" ? "palm" : "";
    if (!mode) return null;
    const targetKind = ["keypoint", "segment", "polyline", "polyline_operation", "polyline_semantic", "face_observation"].includes(item.targetKind) ? item.targetKind : "";
    const targetKey = typeof item.targetKey === "string" ? item.targetKey : "";
    if (!targetKind || !targetKey) return null;
    const correctionKey = item.correctionKey || geometryCorrectionKey({
      correctedAt: item.correctedAt,
      sampleName: item.sampleName,
      targetKind,
      targetKey,
      endpoint: item.endpoint
    }, index);
    const provenance = normalizeSampleProvenance(item.sampleProvenance || {
      subjectKey: item.subjectKey,
      sourceType: item.provenanceSourceType,
      rightsNote: item.rightsNote
    });
    return {
      ...item,
      id: item.id || `${item.source || "geometry"}:${mode}:${correctionKey}`,
      correctionKey,
      source: item.source || "training_library",
      mode,
      targetKind,
      targetKey,
      endpoint: item.endpoint || null,
      before: normalizeGeometryPoint(item.before),
      after: normalizeGeometryPoint(item.after),
      reviewStatus: normalizeGeometryTrainingReviewStatus(item.reviewStatus),
      reviewedAt: item.reviewedAt || null,
      feedback: normalizeFeedback(item.feedback),
      sampleProvenance: provenance,
      subjectKey: provenance.subjectKey || null,
      independenceEligible: provenance.independenceEligible
    };
  }

  function normalizeGeometryTrainingReviewStatus(status) {
    return ["accepted", "pending", "disabled"].includes(status) ? status : "accepted";
  }

  function trainingItemEnabled(item) {
    return normalizeGeometryTrainingReviewStatus(item && item.reviewStatus) !== "disabled";
  }

  function trainingReviewLabel(item) {
    const status = normalizeGeometryTrainingReviewStatus(item && item.reviewStatus);
    if (status === "disabled") return "已禁用";
    if (status === "pending") return "待审核";
    return "已启用";
  }

  function normalizeGeometryPoint(point) {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
    return {
      x: roundMetric(clamp(Number(point.x), 0, 1)),
      y: roundMetric(clamp(Number(point.y), 0, 1))
    };
  }

  function mergeGeometryTrainingItems(items) {
    const byKey = new Map();
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const normalized = normalizeGeometryTrainingItem(item, index);
      if (!normalized) return;
      const key = [
        normalized.mode,
        normalized.caseId || "",
        normalized.sampleName || "",
        normalized.targetKind,
        normalized.targetKey,
        normalized.endpoint || "",
        normalized.correctedAt || "",
        normalized.before ? `${normalized.before.x},${normalized.before.y}` : "",
        normalized.after ? `${normalized.after.x},${normalized.after.y}` : ""
      ].join("|");
      const previous = byKey.get(key);
      byKey.set(key, previous ? {
        ...normalized,
        reviewStatus: previous.reviewStatus,
        reviewedAt: previous.reviewedAt || normalized.reviewedAt || null
      } : normalized);
    });
    return Array.from(byKey.values()).sort((a, b) => String(b.correctedAt || b.importedAt || "").localeCompare(String(a.correctedAt || a.importedAt || "")));
  }

  function geometryCorrectionKey(correction, index = 0) {
    return [
      correction && correction.correctedAt ? correction.correctedAt : `i${index}`,
      correction && correction.sampleName ? correction.sampleName : "",
      correction && correction.targetKind ? correction.targetKind : "",
      correction && correction.targetKey ? correction.targetKey : "",
      correction && correction.endpoint ? correction.endpoint : ""
    ].join("|");
  }

  function geometryTargetSnapshot(modelResult, correction) {
    if (!modelResult || !correction) return null;
    if (correction.targetKind === "keypoint") {
      const point = (modelResult.keypoints || []).find((item) => item.key === correction.targetKey);
      return point ? {
        key: point.key,
        role: point.role || "",
        x: point.x,
        y: point.y,
        confidence: point.confidence,
        source: point.source
      } : null;
    }
    if (correction.targetKind === "polyline") {
      const polyline = (modelResult.creasePolylines || []).find((item) => item.key === correction.targetKey);
      const pointIndex = Number.isInteger(correction.pointIndex)
        ? correction.pointIndex
        : Number(String(correction.endpoint || "").replace("point_", ""));
      const point = polyline && Array.isArray(polyline.points) ? polyline.points[pointIndex] : null;
      return polyline && point ? {
        key: polyline.key,
        label: polyline.label,
        pointIndex,
        x: point.x,
        y: point.y,
        reviewStatus: polyline.reviewStatus || "pending",
        semanticStatus: "unclassified",
        source: polyline.geometrySource || polyline.source
      } : null;
    }
    const segment = (modelResult.lineSegments || []).find((item) => item.key === correction.targetKey);
    return segment ? {
      key: segment.key,
      label: segment.label,
      x1: segment.x1,
      y1: segment.y1,
      x2: segment.x2,
      y2: segment.y2,
      confidence: segment.confidence,
      source: segment.source
    } : null;
  }

  function geometryTrainingSummary(items) {
    const subjectKeys = new Set();
    const independentSubjectKeys = new Set();
    const summary = {
      total: items.length,
      byMode: { palm: 0, face: 0 },
      bySource: { current_session: 0, case_library: 0, training_library: 0 },
      byTargetKind: { keypoint: 0, segment: 0, polyline: 0, polyline_operation: 0, polyline_semantic: 0, face_observation: 0 },
      byReviewStatus: { accepted: 0, pending: 0, disabled: 0 },
      enabled: 0,
      disabled: 0,
      distinctSubjectCount: 0,
      independentSubjectCount: 0,
      unassignedItemCount: 0,
      bookReferenceItemCount: 0,
      topTargets: []
    };
    const targetCounts = new Map();
    items.forEach((item) => {
      if (summary.byMode[item.mode] !== undefined) summary.byMode[item.mode] += 1;
      if (summary.bySource[item.source] !== undefined) summary.bySource[item.source] += 1;
      if (summary.byTargetKind[item.targetKind] !== undefined) summary.byTargetKind[item.targetKind] += 1;
      const reviewStatus = normalizeGeometryTrainingReviewStatus(item.reviewStatus);
      summary.byReviewStatus[reviewStatus] += 1;
      if (trainingItemEnabled(item)) summary.enabled += 1;
      else summary.disabled += 1;
      const provenance = normalizeSampleProvenance(item.sampleProvenance);
      if (provenance.subjectKey) subjectKeys.add(provenance.subjectKey);
      else summary.unassignedItemCount += 1;
      if (provenance.independenceEligible) independentSubjectKeys.add(provenance.subjectKey);
      if (provenance.sourceType === "book_reference") summary.bookReferenceItemCount += 1;
      const target = item.targetKey || "unknown";
      targetCounts.set(target, (targetCounts.get(target) || 0) + 1);
    });
    summary.topTargets = Array.from(targetCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([key, count]) => ({ key, count }));
    summary.distinctSubjectCount = subjectKeys.size;
    summary.independentSubjectCount = independentSubjectKeys.size;
    return summary;
  }

  function geometryTrainingProfile(mode = "") {
    const cacheKey = mode || "all";
    if (derivedDataCache.geometryProfiles.has(cacheKey)) {
      return derivedDataCache.geometryProfiles.get(cacheKey);
    }
    const datasetItems = geometryTrainingDataset().items;
    const items = datasetItems.filter((item) => trainingItemEnabled(item) && (!mode || item.mode === mode) && item.before && item.after && !(item.targetKey === "hairline_center" && item.reviewStatus !== "accepted"));
    const grouped = new Map();
    items.forEach((item) => {
      const dx = clamp(Number(item.after.x) - Number(item.before.x), -0.12, 0.12);
      const dy = clamp(Number(item.after.y) - Number(item.before.y), -0.12, 0.12);
      const key = geometryProfileKey(item.targetKind, item.targetKey, item.endpoint);
      const existing = grouped.get(key) || {
        targetKind: item.targetKind,
        targetKey: item.targetKey,
        endpoint: item.endpoint || null,
        count: 0,
        dx: 0,
        dy: 0,
        sources: []
      };
      existing.count += 1;
      existing.dx += dx;
      existing.dy += dy;
      if (item.source) existing.sources.push(item.source);
      grouped.set(key, existing);
    });
    const offsets = Array.from(grouped.values()).map((item) => ({
      targetKind: item.targetKind,
      targetKey: item.targetKey,
      endpoint: item.endpoint,
      count: item.count,
      dx: roundMetric(clamp(item.dx / item.count, -0.08, 0.08)),
      dy: roundMetric(clamp(item.dy / item.count, -0.08, 0.08)),
      sources: Array.from(new Set(item.sources)).slice(0, 3)
    }));
    const profile = {
      mode: mode || "all",
      totalItems: items.length,
      disabledItems: datasetItems.filter((item) => !trainingItemEnabled(item) && (!mode || item.mode === mode)).length,
      offsetCount: offsets.length,
      offsets,
      generatedAt: new Date().toISOString()
    };
    derivedDataCache.geometryProfiles.set(cacheKey, profile);
    return profile;
  }

  function geometryOffsetFor(profile, targetKind, targetKey, endpoint = null) {
    if (!profile || !Array.isArray(profile.offsets)) return emptyGeometryOffset();
    const key = geometryProfileKey(targetKind, targetKey, endpoint);
    const item = profile.offsets.find((offset) => geometryProfileKey(offset.targetKind, offset.targetKey, offset.endpoint) === key);
    if (!item || !item.count) return emptyGeometryOffset();
    return {
      dx: roundMetric(clamp(Number(item.dx || 0), -0.08, 0.08)),
      dy: roundMetric(clamp(Number(item.dy || 0), -0.08, 0.08)),
      count: item.count,
      sources: item.sources || []
    };
  }

  function emptyGeometryOffset() {
    return { dx: 0, dy: 0, count: 0, sources: [] };
  }

  function geometryProfileKey(targetKind, targetKey, endpoint = null) {
    return `${targetKind || ""}:${targetKey || ""}:${endpoint || ""}`;
  }

  function geometryTrainingFilterState() {
    const filters = state.geometryTrainingFilters || {};
    return {
      mode: ["all", "palm", "face"].includes(filters.mode) ? filters.mode : "all",
      source: ["all", "current_session", "case_library", "training_library"].includes(filters.source) ? filters.source : "all",
      reviewStatus: ["all", "accepted", "pending", "disabled"].includes(filters.reviewStatus) ? filters.reviewStatus : "all",
      targetKind: ["all", "keypoint", "segment", "polyline", "polyline_operation", "polyline_semantic", "face_observation"].includes(filters.targetKind) ? filters.targetKind : "all"
    };
  }

  function syncGeometryTrainingFilterControls(filters) {
    Object.entries(filters).forEach(([key, value]) => {
      const node = $(`#geometry-training-filter-${key}`);
      if (node && node.value !== value) node.value = value;
    });
  }

  function geometryTrainingItemMatchesFilters(item, filters = geometryTrainingFilterState()) {
    if (!item) return false;
    if (filters.mode !== "all" && item.mode !== filters.mode) return false;
    if (filters.source !== "all" && item.source !== filters.source) return false;
    if (filters.reviewStatus !== "all" && normalizeGeometryTrainingReviewStatus(item.reviewStatus) !== filters.reviewStatus) return false;
    if (filters.targetKind !== "all" && item.targetKind !== filters.targetKind) return false;
    return true;
  }

  function filteredGeometryTrainingItems(items, filters = geometryTrainingFilterState()) {
    return (Array.isArray(items) ? items : []).filter((item) => geometryTrainingItemMatchesFilters(item, filters));
  }

  function renderGeometryTrainingPanel() {
    const countNode = $("#geometry-training-count");
    const summaryNode = $("#geometry-training-summary");
    const listNode = $("#geometry-training-list");
    const filterCountNode = $("#geometry-training-filter-count");
    if (!countNode || !summaryNode || !listNode) return;
    const dataset = geometryTrainingDataset();
    const summary = dataset.summary;
    const filters = geometryTrainingFilterState();
    const filteredItems = filteredGeometryTrainingItems(dataset.items, filters);
    const filteredLibraryItems = filteredItems.filter((item) => item.source === "training_library");
    const palmProfile = geometryTrainingProfile("palm");
    const faceProfile = geometryTrainingProfile("face");
    syncGeometryTrainingFilterControls(filters);
    countNode.textContent = `${summary.enabled}/${summary.total} 条启用`;
    if (filterCountNode) {
      filterCountNode.textContent = `筛选 ${filteredItems.length}/${summary.total} 条 · 本地库 ${filteredLibraryItems.length} 条可批量`;
    }
    const targetText = summary.topTargets.length
      ? summary.topTargets.map((item) => `${geometryTargetLabel(item.key)} ${item.count}`).join(" / ")
      : "暂无高频目标";
    summaryNode.innerHTML = `
      <div class="learning-line">
        <span><b>${summary.total}</b> 总校正</span>
        <span><b>${summary.byMode.palm}</b> 手相</span>
        <span><b>${summary.byMode.face}</b> 面相</span>
        <span><b>${summary.byTargetKind.segment}</b> 线段</span>
        <span><b>${summary.byTargetKind.keypoint}</b> 关键点</span>
        <span><b>${summary.byTargetKind.polyline_operation}</b> 拆分/重连</span>
        <span><b>${summary.byTargetKind.polyline_semantic}</b> 掌纹语义真值</span>
        <span><b>${summary.byTargetKind.face_observation}</b> 面部观察真值</span>
        <span><b>${summary.byReviewStatus.pending}</b> 待审核</span>
        <span><b>${summary.disabled}</b> 已禁用</span>
      </div>
      <div class="case-meta">当前会话 ${summary.bySource.current_session} · 案例库 ${summary.bySource.case_library} · 本地训练库 ${summary.bySource.training_library} · 高频 ${escapeHtml(targetText)}</div>
      <div class="case-meta">人物覆盖：有编号 ${summary.distinctSubjectCount} 人 · 可计入独立覆盖 ${summary.independentSubjectCount} 人 · 未编号训练项 ${summary.unassignedItemCount} · 书籍图例项 ${summary.bookReferenceItemCount}（不计真人泛化）。</div>
      <div class="case-meta">偏移档案：手相 ${palmProfile.offsetCount} 个目标 / ${palmProfile.totalItems} 条 · 面相 ${faceProfile.offsetCount} 个目标 / ${faceProfile.totalItems} 条；禁用样本不进入偏移。</div>
    `;
    if (!dataset.items.length) {
      listNode.textContent = "还没有拖拽校正；开启校正后拖动关键点或线段端点即可沉淀训练样本。";
      return;
    }
    if (!filteredItems.length) {
      listNode.textContent = "当前筛选没有训练样本。";
      return;
    }
    const visibleItems = filteredItems.slice(0, geometryTrainingRenderLimit);
    const hiddenCount = Math.max(0, filteredItems.length - visibleItems.length);
    setHtml(listNode, `${visibleItems.map((item) => `
      <div class="training-item">
        <div>
          <strong>${escapeHtml(geometryTargetLabel(item.targetKey))}</strong>
          <div class="case-meta">${item.mode === "palm" ? "手相" : "面相"} · ${escapeHtml(item.sampleName || "未命名样本")} · ${escapeHtml(trainingSourceLabel(item.source))}${item.subjectKey ? ` · 人物 ${escapeHtml(item.subjectKey)}` : " · 人物未编号"}</div>
          <div class="case-meta">${trainingItemEvidenceText(item)}</div>
        </div>
        <div class="case-actions">
          <span class="pill">${escapeHtml(item.targetKind === "segment" ? "线段" : item.targetKind === "polyline" ? "掌褶控制点" : item.targetKind === "polyline_operation" ? "掌褶拆分/重连" : item.targetKind === "polyline_semantic" ? "传统掌纹语义" : item.targetKind === "face_observation" ? "面部观察真值" : "关键点")}</span>
          <span class="pill">${feedbackLabel(item.feedback.rating)}</span>
          <span class="pill">${escapeHtml(trainingReviewLabel(item))}</span>
          ${trainingReviewControl(item)}
        </div>
      </div>
    `).join("")}${hiddenCount ? `<div class="training-more">还有 ${hiddenCount} 条匹配样本，可继续导出 JSON 复核。</div>` : ""}`);
  }

  function trainingReviewControl(item) {
    if (!item || item.source !== "training_library") return "";
    const nextStatus = trainingItemEnabled(item) ? "disabled" : "accepted";
    const label = nextStatus === "disabled" ? "禁用" : "启用";
    return `<button class="secondary-action compact-action" type="button" data-training-review-id="${escapeHtml(item.id)}" data-training-review-status="${nextStatus}">${label}</button>`;
  }

  function setGeometryTrainingItemReview(itemId, status) {
    setGeometryTrainingItemsReview([itemId], status);
  }

  function setGeometryTrainingFilteredReview(status) {
    const filters = geometryTrainingFilterState();
    const itemIds = geometryTrainingDataset().items
      .filter((item) => item.source === "training_library" && geometryTrainingItemMatchesFilters(item, filters))
      .map((item) => item.id);
    setGeometryTrainingItemsReview(itemIds, status);
  }

  function setGeometryTrainingItemsReview(itemIds, status) {
    const ids = new Set((Array.isArray(itemIds) ? itemIds : [itemIds]).filter(Boolean));
    if (!ids.size) return;
    const nextStatus = normalizeGeometryTrainingReviewStatus(status);
    let changed = false;
    state.geometryTrainingLibrary = state.geometryTrainingLibrary.map((item, index) => {
      const normalized = normalizeGeometryTrainingLibraryItem(item, index);
      if (!normalized || !ids.has(normalized.id)) return normalized;
      changed = true;
      return {
        ...normalized,
        reviewStatus: nextStatus,
        reviewedAt: new Date().toISOString()
      };
    }).filter(Boolean);
    if (!changed) return;
    invalidateDerivedData();
    persistGeometryTrainingLibrary();
    renderGeometryTrainingPanel();
    renderPalmReport();
    renderFaceReport();
  }

  function geometryTargetLabel(key) {
    const faceObservationLabel=faceObservationRuntime.targetLabel(key);
    if(faceObservationLabel)return faceObservationLabel;
    const labels = {
      life_line: "生命线",
      head_line: "智慧线",
      heart_line: "感情线",
      fate_line: "命运线",
      sun_line: "太阳线",
      wealth_lines: "财运纹",
      helper_lines: "贵人线",
      split: "掌褶人工拆分",
      reconnect: "掌褶人工重连",
      brow_eye_axis: "眉眼轴",
      nose_axis: "鼻轴",
      mouth_axis: "口部轴",
      jaw_axis: "下巴承托",
      profile_axis: "侧面轮廓"
    };
    return labels[key] || key || "未知目标";
  }

  function trainingSourceLabel(source) {
    if (source === "case_library") return "案例库";
    if (source === "training_library") return "本地训练库";
    return "当前会话";
  }

  function formatGeometryPoint(point) {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return "--";
    return `${roundMetric(point.x)}, ${roundMetric(point.y)}`;
  }

  function trainingItemEvidenceText(item) {
    if (item && item.targetKind === "face_observation") {
      return faceObservationRuntime.evidence(item);
    }
    if (item && item.targetKind === "polyline_semantic") {
      const pointCount = item.targetSnapshot && Array.isArray(item.targetSnapshot.points) ? item.targetSnapshot.points.length : 0;
      return `二阶段人工确认 · ${pointCount} 个有界中心线点 · 传统分类用途`;
    }
    if (item && item.targetKind === "polyline_operation") return `结构操作 ${escapeHtml(item.operation || item.targetKey || "")}`;
    return `${formatGeometryPoint(item && item.before)} → ${formatGeometryPoint(item && item.after)}`;
  }

  function routeCorrectionSummary() {
    const corrections = state.universalRoutes.filter((item) => item.correction);
    const nativeCorrections = corrections.filter((item) => item.correction.source === "native_cross_mode_reroute");
    const manualCorrections = corrections.filter((item) => item.correction.source !== "native_cross_mode_reroute");
    return {
      total: state.universalRoutes.length,
      corrected: corrections.length,
      manualCorrected: manualCorrections.length,
      nativeCorrected: nativeCorrections.length,
      palmToFace: corrections.filter((item) => item.correction.from === "palm" && item.correction.to === "face").length,
      faceToPalm: corrections.filter((item) => item.correction.from === "face" && item.correction.to === "palm").length
    };
  }

  function experienceAdjustmentLabel(profile) {
    if (!profile || profile.reviewed < 3) return "样本不足";
    if (profile.scoreAdjustment > 0) return `加权+${profile.scoreAdjustment}`;
    if (profile.scoreAdjustment < 0) return `保守${profile.scoreAdjustment}`;
    return "稳定";
  }

  function normalizeCaseItem(item, fallbackId) {
    const source = item || {};
    const payload = source.payload || {};
    const mode = source.mode || payload.type || "case";
    const createdAt = source.createdAt || payload.createdAt || new Date().toISOString();
    const feedback = normalizeFeedback(source.feedback || payload.feedback);
    payload.feedback = feedback;
    const thumbnails = Array.isArray(source.thumbnails) && source.thumbnails.length
      ? source.thumbnails
      : caseThumbnailsFromPayload(payload);
    return {
      ...source,
      id: source.id || fallbackId || `${mode}-${createdAt}`,
      title: source.title || caseTitle(payload),
      mode,
      createdAt,
      feedback,
      thumbnails,
      payload
    };
  }

  function formatIsoTime(value) {
    return String(value).replace("T", " ").slice(0, 19);
  }

  async function exportCaseLibrary() {
    await ensureFullCaseLibraryLoaded();
    await hydrateAllCaseAssets();
    const payload = {
      type: "case_library",
      version: 2,
      exportedAt: new Date().toISOString(),
      storage: caseLibraryStorageSnapshot(),
      learningSummary: learningSummaryData(),
      cases: state.caseLibrary
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `case-library-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  async function exportGeometryTrainingDataset() {
    await ensureFullCaseLibraryLoaded();
    const payload = geometryTrainingDataset();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `geometry-training-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  async function importGeometryTrainingDataset(fileList) {
    const files = Array.from(fileList || []);
    let imported = [];
    for (const file of files) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const items = Array.isArray(parsed)
          ? parsed
          : parsed && Array.isArray(parsed.items)
            ? parsed.items
            : [];
        imported = imported.concat(items.map(normalizeGeometryTrainingLibraryItem).filter(Boolean));
      } catch (error) {
      }
    }
    if (imported.length) {
      state.geometryTrainingLibrary = mergeGeometryTrainingItems([
        ...state.geometryTrainingLibrary,
        ...imported
      ]).map(normalizeGeometryTrainingLibraryItem).filter(Boolean).slice(0, 1000);
      invalidateDerivedData();
      persistGeometryTrainingLibrary();
      renderGeometryTrainingPanel();
    }
  }

  async function importCaseLibrary(fileList) {
    await ensureFullCaseLibraryLoaded();
    const files = Array.from(fileList || []);
    for (const file of files) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const cases = Array.isArray(parsed) ? parsed : Array.isArray(parsed.cases) ? parsed.cases : [];
        state.caseLibrary = mergeCases(state.caseLibrary, cases);
        state.caseLibraryTotalCount = state.caseLibrary.length;
        state.caseLibraryFullyLoaded = true;
        state.caseLibraryVisibleCount = caseLibraryInitialRenderLimit;
        invalidateDerivedData();
      } catch (error) {
      }
    }
    await ensurePersonalMasterCases({ persist: false });
    renderCaseLibrary();
    renderPersonalProfile();
    renderPalmReport();
    renderFaceReport();
    await persistCaseLibrary();
  }

  function mergeCases(existing, incoming) {
    const byId = new Map(existing.map((item) => [String(item.id), item]));
    for (const item of incoming) {
      if (!item || !item.payload) continue;
      const id = String(item.id || `${item.mode || item.payload.type || "case"}-${Date.now()}-${byId.size}`);
      const current = byId.get(id);
      const normalized = normalizeCaseItem({ ...item, id }, id);
      const reservedMode = personalProfileModes.find((mode) => id === personalMasterCaseId(mode));
      if (reservedMode) {
        if (!validPersonalMasterCase(normalized, reservedMode)) continue;
        if (current && validPersonalMasterCase(current, reservedMode)) {
          const currentTime = String(current.updatedAt || current.createdAt || "");
          const incomingTime = String(normalized.updatedAt || normalized.createdAt || "");
          if (incomingTime <= currentTime) continue;
        }
      } else if (current && isPersonalMasterCase(current) && !isPersonalMasterCase(normalized)) {
        continue;
      }
      byId.set(id, normalized);
    }
    return sortCaseItems(Array.from(byId.values())).slice(0, caseLibraryMaxCases);
  }

  function sampleForExport(sample) {
    return {
      id: sample.id,
      name: sample.name,
      type: sample.type,
      userType: sample.userType,
      suggestedType: sample.suggestedType,
      suggestedMode: sample.modeMismatch ? sample.modeMismatch.suggestedMode : null,
      modeMismatch: sample.modeMismatch ? deepClone(sample.modeMismatch) : null,
      noTargetEvidence: sample.noTargetEvidence ? deepClone(sample.noTargetEvidence) : null,
      handOrientation: sample.handOrientation || null,
      faceOrientation: sample.faceOrientation || null,
      label: sample.label,
      quality: sample.quality,
      warnings: sample.warnings,
      overlayRegions: sample.overlayRegions,
      routeEvidence: sample.routeEvidence,
      routeCorrected: Boolean(sample.routeEvidence && sample.routeEvidence.correctedMode),
      typeCorrection: sample.typeCorrection || null,
      typeCalibration: sample.metrics ? sample.metrics.typeCalibration || null : null,
      rotation: normalizeTotalRotation(sample.rotation || 0),
      rotationCorrections: sample.rotationCorrections || [],
      preprocessCorrections: sample.preprocessCorrections || [],
      subjectSelection: sample.subjectSelection || null,
      subjectSelectionHistory: sample.subjectSelectionHistory || [],
      recognitionCache: sample.recognitionCache || null,
      recognitionRevision: sampleRecognitionRevision(sample),
      recognitionResultAudit: sample.recognitionResultAudit || null,
      recognitionResultHistory: Array.isArray(sample.recognitionResultHistory) ? sample.recognitionResultHistory.slice(-12) : [],
      imageDecode: normalizeImageDecodeAudit(sample.imageDecode),
      sampleProvenance: normalizeSampleProvenance(sample.sampleProvenance),
      thumbnail: sample.thumbnail || null,
      personalAssetUrl: safePersonalAssetUrl(sample.personalAssetUrl),
      historicalTransforms: sample.historicalTransforms || null,
      modelVersion: sample.modelVersion,
      modelResult: sample.modelResult,
      geometryCorrections: sample.geometryCorrections || [],
      creaseGeometryEdits: sample.creaseGeometryEdits || [],
      metrics: sample.metrics
    };
  }

  function routeLearningData(mode) {
    return state.universalRoutes
      .filter((item) => item.mode === mode || (item.correction && (item.correction.from === mode || item.correction.to === mode)))
      .map((item) => ({
        fileName: item.fileName,
        mode: item.mode,
        sampleType: item.sampleType,
        confidence: item.confidence,
        routeGap: item.routeGap,
        needsReview: item.needsReview,
        routeCandidates: item.routeCandidates || [],
        primaryCandidate: item.primaryCandidate || null,
        secondaryCandidate: item.secondaryCandidate || null,
        palmScore: item.palmScore,
        faceScore: item.faceScore,
        rawPalmScore: item.rawPalmScore,
        rawFaceScore: item.rawFaceScore,
        calibration: item.calibration,
        calibrationAfter: item.calibrationAfter,
        nativeModeEvidence: item.nativeModeEvidence || null,
        typeCorrection: item.typeCorrection || null,
        palmSuggestedType: item.palmMetrics ? item.palmMetrics.suggestedType : "",
        faceSuggestedType: item.faceMetrics ? item.faceMetrics.suggestedType : "",
        reasons: item.reasons,
        correction: item.correction,
        createdAt: item.createdAt
      }));
  }

  function pillarBox(label, value) {
    return `<div class="score-box"><span>${label}</span><b>${escapeHtml(value)}</b><small class="muted">本地计算</small></div>`;
  }

  function estimatePillars(date, dayPillar) {
    return requireBaziRuntime().estimatePillars(date, dayPillar);
  }

  function elementText(pillars) {
    return requireBaziRuntime().elementText(pillars);
  }

  function baziTimeline(birthYear, pillars, range = { startYear: birthYear, endYear: birthYear + 100 }, context = {}) {
    return requireBaziRuntime().baziTimeline(birthYear, pillars, range, context);
  }

  function baziTimelineYear(birthYear, pillars, year, context = {}) {
    return requireBaziRuntime().baziTimelineYear(birthYear, pillars, year, context);
  }

  function baziTimelineProvider(birthYear, pillars, range = { startYear: birthYear, endYear: birthYear + 100 }, context = {}) {
    return requireBaziRuntime().baziTimelineProvider(birthYear, pillars, range, context);
  }

  function baziBranchRelations(branch, pillars) {
    return requireBaziRuntime().baziBranchRelations(branch, pillars);
  }

  function formatDateTime(date) {
    return requireBaziRuntime().formatDateTime(date);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initRuntimePerformanceMonitor();
    initTabs();
    initUploads();
    initCamera();
    initGeometryControls();
    initPersonalProfile();
    initReports();
    markRuntimeBootComplete();
  });
})();
