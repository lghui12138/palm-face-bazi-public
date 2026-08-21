(function (global) {
  "use strict";

  const adapterVersion = 3;

  function create(options = {}) {
    const config = {
      dbName: options.dbName || "palmFaceBaziSite",
      dbVersion: Number(options.dbVersion || 3),
      storeName: options.storeName || "cases",
      assetStoreName: options.assetStoreName || "caseAssets",
      legacyKey: options.legacyKey || "palmFaceBaziCases.v1",
      indexKey: options.indexKey || "palmFaceBaziCaseIndex.v2",
      migrationKey: options.migrationKey || "palmFaceBaziCaseMigration.v1",
      maxCases: Math.max(1, Number(options.maxCases || 200)),
      initialCaseLimit: Math.max(1, Number(options.initialCaseLimit || 80))
    };
    const indexedDb = options.indexedDB === undefined ? global.indexedDB : options.indexedDB;
    const localStore = options.localStorage === undefined ? safeLocalStorage(global) : options.localStorage;
    let databasePromise = null;
    let databaseUpgradeFrom = null;
    let currentStatus = {
      adapterVersion,
      backend: indexedDb ? "indexeddb" : "localstorage",
      status: "idle",
      migrated: false,
      caseCount: 0,
      loadedCaseCount: 0,
      fullyLoaded: true,
      pageSize: config.initialCaseLimit,
      indexCount: 0,
      assetCount: 0,
      hydratedAssetCount: 0,
      imageStoreSeparate: Boolean(indexedDb),
      error: ""
    };

    function readIndex() {
      const parsed = readJson(localStore, config.indexKey, []);
      return Array.isArray(parsed)
        ? parsed.map(normalizeIndexEntry).filter(Boolean).slice(0, config.maxCases)
        : [];
    }

    function readLegacy() {
      const parsed = readJson(localStore, config.legacyKey, []);
      return Array.isArray(parsed) ? parsed.filter(validCase).slice(0, config.maxCases) : [];
    }

    async function load() {
      const startupIndex = readIndex();
      currentStatus = {
        ...currentStatus,
        status: "loading",
        indexCount: startupIndex.length,
        error: ""
      };
      if (!indexedDb) return loadLegacyFallback("indexeddb_unavailable", startupIndex);
      try {
        const database = await openDatabase();
        const upgradeFromVersion = databaseUpgradeFrom;
        databaseUpgradeFrom = config.dbVersion;
        let totalCases = await countCases(database);
        let migratedCases = null;
        let migrated = false;
        if (upgradeFromVersion !== null && upgradeFromVersion < 2 && totalCases) {
          const legacyDatabaseCases = sortCases(await readAllCases(database)).slice(0, config.maxCases);
          const result = await replaceDatabaseCases(database, legacyDatabaseCases);
          migratedCases = result.cases;
          totalCases = migratedCases.length;
          migrated = true;
        }
        if (!totalCases) {
          const legacyCases = sortCases(readLegacy()).slice(0, config.maxCases);
          if (legacyCases.length) {
            const result = await replaceDatabaseCases(database, legacyCases);
            migratedCases = result.cases;
            totalCases = migratedCases.length;
            migrated = true;
          }
        }
        let cases = migratedCases
          ? migratedCases.slice(0, config.initialCaseLimit)
          : await readCasesPage(database, 0, config.initialCaseLimit);
        if (!migrated && cases.some(containsEmbeddedAssets)) {
          const embeddedCases = sortCases(await readAllCases(database)).slice(0, config.maxCases);
          const result = await replaceDatabaseCases(database, embeddedCases);
          migratedCases = result.cases;
          totalCases = migratedCases.length;
          cases = migratedCases.slice(0, config.initialCaseLimit);
          migrated = true;
        }
        if (migrated) {
          writeJson(localStore, config.migrationKey, {
            version: adapterVersion,
            migratedAt: new Date().toISOString(),
            caseCount: totalCases
          });
        }
        const index = migratedCases
          ? writeIndex(migratedCases)
          : startupIndex.length
            ? startupIndex.slice(0, config.maxCases)
            : writeIndex(cases);
        const assetCount = await countAssets(database);
        const fullyLoaded = cases.length >= totalCases;
        currentStatus = {
          adapterVersion,
          backend: "indexeddb",
          status: "ready",
          migrated,
          caseCount: totalCases,
          loadedCaseCount: cases.length,
          fullyLoaded,
          pageSize: config.initialCaseLimit,
          indexCount: index.length,
          assetCount,
          hydratedAssetCount: 0,
          imageStoreSeparate: true,
          error: ""
        };
        return { cases, index, ...currentStatus };
      } catch (error) {
        return loadLegacyFallback(shortError(error), startupIndex);
      }
    }

    async function loadPage(offset = 0, limit = config.initialCaseLimit) {
      const normalizedOffset = Math.max(0, Math.floor(Number(offset || 0)));
      const normalizedLimit = Math.max(1, Math.min(config.maxCases, Math.floor(Number(limit || config.initialCaseLimit))));
      if (!indexedDb) {
        const cases = sortCases(readLegacy()).slice(normalizedOffset, normalizedOffset + normalizedLimit);
        const caseCount = sortCases(readLegacy()).slice(0, config.maxCases).length;
        return {
          cases,
          offset: normalizedOffset,
          limit: normalizedLimit,
          caseCount,
          loadedCaseCount: Math.min(caseCount, normalizedOffset + cases.length),
          fullyLoaded: normalizedOffset + cases.length >= caseCount,
          hasMore: normalizedOffset + cases.length < caseCount,
          backend: "localstorage"
        };
      }
      const database = await openDatabase();
      const caseCount = await countCases(database);
      const cases = await readCasesPage(database, normalizedOffset, normalizedLimit);
      const loadedCaseCount = Math.min(caseCount, normalizedOffset + cases.length);
      const fullyLoaded = loadedCaseCount >= caseCount;
      currentStatus = {
        ...currentStatus,
        caseCount,
        loadedCaseCount,
        fullyLoaded,
        pageSize: normalizedLimit
      };
      return {
        cases,
        offset: normalizedOffset,
        limit: normalizedLimit,
        caseCount,
        loadedCaseCount,
        fullyLoaded,
        hasMore: !fullyLoaded,
        backend: "indexeddb"
      };
    }

    async function replace(cases) {
      const normalizedCases = sortCases(Array.isArray(cases) ? cases.filter(validCase) : []).slice(0, config.maxCases);
      if (!indexedDb) throw new Error("indexeddb_unavailable");
      try {
        const database = await openDatabase();
        const stored = await replaceDatabaseCases(database, normalizedCases);
        const index = writeIndex(normalizedCases);
        const assetCount = await countAssets(database);
        currentStatus = {
          adapterVersion,
          backend: "indexeddb",
          status: "ready",
          migrated: currentStatus.migrated,
          caseCount: stored.cases.length,
          loadedCaseCount: stored.cases.length,
          fullyLoaded: true,
          pageSize: config.initialCaseLimit,
          indexCount: index.length,
          assetCount,
          hydratedAssetCount: currentStatus.hydratedAssetCount,
          imageStoreSeparate: true,
          error: ""
        };
        return { cases: stored.cases, index, ...currentStatus };
      } catch (error) {
        currentStatus = {
          ...currentStatus,
          backend: "localstorage",
          status: "degraded",
          imageStoreSeparate: false,
          error: shortError(error)
        };
        throw error;
      }
    }

    async function loadAssets(caseIds) {
      if (!indexedDb) return [];
      const database = await openDatabase();
      const ids = Array.isArray(caseIds)
        ? Array.from(new Set(caseIds.map(String).filter(Boolean)))
        : null;
      const assets = await readAssets(database, ids);
      currentStatus = {
        ...currentStatus,
        hydratedAssetCount: Math.max(currentStatus.hydratedAssetCount, assets.length)
      };
      return assets;
    }

    function writeIndex(cases) {
      const index = buildIndex(cases, config.maxCases);
      writeJson(localStore, config.indexKey, index);
      return index;
    }

    function snapshot() {
      return { ...currentStatus };
    }

    function openDatabase() {
      if (databasePromise) return databasePromise;
      databasePromise = new Promise((resolve, reject) => {
        let request;
        try {
          request = indexedDb.open(config.dbName, config.dbVersion);
        } catch (error) {
          reject(error);
          return;
        }
        request.onupgradeneeded = (event) => {
          const database = request.result;
          databaseUpgradeFrom = Number(event.oldVersion || 0);
          let caseStore;
          if (!database.objectStoreNames.contains(config.storeName)) {
            caseStore = database.createObjectStore(config.storeName, { keyPath: "id" });
          } else {
            caseStore = request.transaction.objectStore(config.storeName);
          }
          if (!caseStore.indexNames.contains("createdAt")) caseStore.createIndex("createdAt", "createdAt", { unique: false });
          if (!caseStore.indexNames.contains("mode")) caseStore.createIndex("mode", "mode", { unique: false });
          let assetStore;
          if (!database.objectStoreNames.contains(config.assetStoreName)) {
            assetStore = database.createObjectStore(config.assetStoreName, { keyPath: "caseId" });
          } else {
            assetStore = request.transaction.objectStore(config.assetStoreName);
          }
          if (!assetStore.indexNames.contains("updatedAt")) assetStore.createIndex("updatedAt", "updatedAt", { unique: false });
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => database.close();
          resolve(database);
        };
        request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
        request.onblocked = () => reject(new Error("indexeddb_open_blocked"));
      }).catch((error) => {
        databasePromise = null;
        throw error;
      });
      return databasePromise;
    }

    function readAllCases(database) {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(config.storeName, "readonly");
        const request = transaction.objectStore(config.storeName).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error || new Error("indexeddb_read_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("indexeddb_read_aborted"));
      });
    }

    function readCasesPage(database, offset, limit) {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(config.storeName, "readonly");
        const store = transaction.objectStore(config.storeName);
        const source = store.index("createdAt");
        const cases = [];
        let skipped = false;
        const request = source.openCursor(null, "prev");
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || cases.length >= limit) {
            resolve(cases);
            return;
          }
          if (offset > 0 && !skipped) {
            skipped = true;
            cursor.advance(offset);
            return;
          }
          cases.push(cursor.value);
          if (cases.length >= limit) {
            resolve(cases);
            return;
          }
          cursor.continue();
        };
        request.onerror = () => reject(request.error || new Error("indexeddb_page_read_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("indexeddb_page_read_aborted"));
      });
    }

    function countCases(database) {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(config.storeName, "readonly");
        const request = transaction.objectStore(config.storeName).count();
        request.onsuccess = () => resolve(Math.min(config.maxCases, finiteCount(request.result)));
        request.onerror = () => reject(request.error || new Error("indexeddb_case_count_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("indexeddb_case_count_aborted"));
      });
    }

    function readAssets(database, caseIds) {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(config.assetStoreName, "readonly");
        const store = transaction.objectStore(config.assetStoreName);
        if (caseIds === null) {
          const request = store.getAll();
          request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
          request.onerror = () => reject(request.error || new Error("indexeddb_asset_read_failed"));
        } else if (!caseIds.length) {
          resolve([]);
        } else {
          const assets = [];
          caseIds.forEach((caseId) => {
            const request = store.get(caseId);
            request.onsuccess = () => {
              if (request.result) assets.push(request.result);
            };
          });
          transaction.oncomplete = () => resolve(assets);
        }
        transaction.onerror = () => reject(transaction.error || new Error("indexeddb_asset_read_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("indexeddb_asset_read_aborted"));
      });
    }

    function countAssets(database) {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(config.assetStoreName, "readonly");
        const request = transaction.objectStore(config.assetStoreName).count();
        request.onsuccess = () => resolve(finiteCount(request.result));
        request.onerror = () => reject(request.error || new Error("indexeddb_asset_count_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("indexeddb_asset_count_aborted"));
      });
    }

    function replaceDatabaseCases(database, cases) {
      const separated = cases.map((item) => separateCaseAssets(item, config.assetStoreName));
      const storedCases = separated.map((item) => item.caseRecord);
      const keepIds = new Set(storedCases.map((item) => String(item.id)));
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([config.storeName, config.assetStoreName], "readwrite");
        const caseStore = transaction.objectStore(config.storeName);
        const assetStore = transaction.objectStore(config.assetStoreName);
        caseStore.clear();
        storedCases.forEach((item) => caseStore.put(item));
        separated.forEach(({ caseRecord, assetRecord }) => {
          if (assetRecord) {
            assetStore.put(assetRecord);
          } else if (!caseRecord.assetRef) {
            assetStore.delete(String(caseRecord.id));
          }
        });
        const keyRequest = assetStore.getAllKeys();
        keyRequest.onsuccess = () => {
          (keyRequest.result || []).forEach((caseId) => {
            if (!keepIds.has(String(caseId))) assetStore.delete(caseId);
          });
        };
        transaction.oncomplete = () => resolve({ cases: storedCases });
        transaction.onerror = () => reject(transaction.error || new Error("indexeddb_write_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("indexeddb_write_aborted"));
      });
    }

    function loadLegacyFallback(reason, startupIndex) {
      const cases = sortCases(readLegacy()).slice(0, config.maxCases);
      const index = cases.length ? writeIndex(cases) : startupIndex;
      currentStatus = {
        adapterVersion,
        backend: "localstorage",
        status: "degraded",
        migrated: false,
        caseCount: cases.length,
        loadedCaseCount: cases.length,
        fullyLoaded: true,
        pageSize: config.initialCaseLimit,
        indexCount: index.length,
        assetCount: 0,
        hydratedAssetCount: 0,
        imageStoreSeparate: false,
        error: reason
      };
      return { cases, index, ...currentStatus };
    }

    return Object.freeze({
      version: adapterVersion,
      config: Object.freeze({ ...config }),
      load,
      loadPage,
      replace,
      loadAssets,
      hydrateCases,
      readIndex,
      readLegacy,
      writeIndex,
      snapshot
    });
  }

  function separateCaseAssets(item, assetStoreName = "caseAssets") {
    const source = item || {};
    const payload = source.payload && typeof source.payload === "object" ? source.payload : {};
    const samples = Array.isArray(payload.samples) ? payload.samples : null;
    const topLevelThumbnails = Array.isArray(source.thumbnails) ? source.thumbnails.filter(Boolean) : [];
    const sampleThumbnails = [];
    const strippedSamples = samples ? samples.map((sample, index) => {
      if (!sample || typeof sample !== "object") return sample;
      const { thumbnail, ...rest } = sample;
      if (thumbnail) sampleThumbnails.push({ index, thumbnail });
      return rest;
    }) : samples;
    const { thumbnails, ...caseFields } = source;
    const caseRecord = {
      ...caseFields,
      payload: samples ? { ...payload, samples: strippedSamples } : payload
    };
    const hasImages = topLevelThumbnails.length > 0 || sampleThumbnails.length > 0;
    if (hasImages) {
      caseRecord.assetRef = {
        caseId: String(source.id),
        store: assetStoreName,
        thumbnailCount: topLevelThumbnails.length,
        sampleThumbnailCount: sampleThumbnails.length
      };
    } else if (source.assetRef && typeof source.assetRef === "object") {
      caseRecord.assetRef = { ...source.assetRef, caseId: String(source.id), store: assetStoreName };
    } else {
      delete caseRecord.assetRef;
    }
    const assetRecord = hasImages ? {
      caseId: String(source.id),
      thumbnails: topLevelThumbnails,
      sampleThumbnails,
      updatedAt: new Date().toISOString()
    } : null;
    return { caseRecord, assetRecord };
  }

  function hydrateCases(cases, assets) {
    const assetMap = new Map((Array.isArray(assets) ? assets : [])
      .filter((asset) => asset && asset.caseId)
      .map((asset) => [String(asset.caseId), asset]));
    return (Array.isArray(cases) ? cases : []).map((item) => {
      const asset = item && assetMap.get(String(item.id));
      if (!asset) return item;
      const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
      const byIndex = new Map((Array.isArray(asset.sampleThumbnails) ? asset.sampleThumbnails : [])
        .filter((entry) => entry && Number.isInteger(entry.index) && entry.thumbnail)
        .map((entry) => [entry.index, entry.thumbnail]));
      const samples = Array.isArray(payload.samples)
        ? payload.samples.map((sample, index) => byIndex.has(index) ? { ...sample, thumbnail: byIndex.get(index) } : sample)
        : payload.samples;
      return {
        ...item,
        thumbnails: Array.isArray(asset.thumbnails) ? asset.thumbnails : [],
        payload: Array.isArray(payload.samples) ? { ...payload, samples } : payload
      };
    });
  }

  function containsEmbeddedAssets(item) {
    if (Array.isArray(item && item.thumbnails) && item.thumbnails.length) return true;
    return Boolean(item && item.payload && Array.isArray(item.payload.samples) &&
      item.payload.samples.some((sample) => sample && sample.thumbnail));
  }

  function buildIndex(cases, maxCases = 200) {
    return sortCases(Array.isArray(cases) ? cases.filter(validCase) : [])
      .slice(0, Math.max(1, Number(maxCases || 200)))
      .map((item) => {
        const payload = item.payload || {};
        const feedback = item.feedback || payload.feedback || {};
        const matrix = Array.isArray(payload.matrix) ? payload.matrix : [];
        const assetRef = item.assetRef || {};
        return {
          id: String(item.id),
          title: String(item.title || ""),
          mode: String(item.mode || payload.type || "case"),
          createdAt: String(item.createdAt || payload.createdAt || ""),
          feedbackRating: String(feedback.rating || "unreviewed"),
          sampleCount: Array.isArray(payload.samples) ? payload.samples.length : 0,
          readyRegions: matrix.filter((entry) => entry && entry.status === "ready").length,
          totalRegions: matrix.length,
          thumbnailCount: Array.isArray(item.thumbnails)
            ? item.thumbnails.length
            : finiteCount(assetRef.thumbnailCount)
        };
      });
  }

  function normalizeIndexEntry(item) {
    if (!item || !item.id) return null;
    return {
      id: String(item.id),
      title: String(item.title || ""),
      mode: String(item.mode || "case"),
      createdAt: String(item.createdAt || ""),
      feedbackRating: String(item.feedbackRating || "unreviewed"),
      sampleCount: finiteCount(item.sampleCount),
      readyRegions: finiteCount(item.readyRegions),
      totalRegions: finiteCount(item.totalRegions),
      thumbnailCount: finiteCount(item.thumbnailCount)
    };
  }

  function sortCases(cases) {
    return [...cases].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }

  function validCase(item) {
    return Boolean(item && item.id && item.payload && typeof item.payload === "object");
  }

  function finiteCount(value) {
    const count = Number(value || 0);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  }

  function safeLocalStorage(target) {
    try {
      return target.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function readJson(storage, key, fallback) {
    if (!storage || !key) return fallback;
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    if (!storage || !key) return false;
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function shortError(error) {
    return String(error && error.message ? error.message : error || "storage_failed").slice(0, 160);
  }

  global.PalmFaceCaseStorage = Object.freeze({
    version: adapterVersion,
    create,
    buildIndex,
    separateCaseAssets,
    hydrateCases,
    containsEmbeddedAssets
  });
})(globalThis);
