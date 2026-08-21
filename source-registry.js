(function (root) {
  "use strict";

  const registryVersion = "2026-07-24.8";

  const tiers = {
    technical_primary: {
      label: "官方技术原始资料",
      tone: "green",
      meaning: "支持识别接口、关键点输出和性能边界。"
    },
    measurement_peer_reviewed: {
      label: "同行评议测量资料",
      tone: "green",
      meaning: "支持可重复的解剖标志点和相对比例定义，不代表统一审美标准。"
    },
    medical_peer_reviewed: {
      label: "同行评议医学资料",
      tone: "green",
      meaning: "支持掌褶解剖、发育和人群变异，不支持从照片自行诊断。"
    },
    scientific_boundary: {
      label: "科学边界资料",
      tone: "gold",
      meaning: "用于限制人格、疾病、寿命和确定性命运推断。"
    },
    traditional_reference: {
      label: "传统体系参考",
      tone: "gold",
      meaning: "只支持传统手相或面相体系内的术语与对照，不是科学预测证据。"
    },
    cultural_history: {
      label: "文化史资料",
      tone: "gold",
      meaning: "用于交代相术的历史流变，不支持个体命运事实判断。"
    }
  };

  const sources = {
    "local.reid": {
      shortLabel: "瑞德《手相学习百科》",
      title: "《手相学习百科》（原作 The Art of Hand Reading）",
      author: "Lori Reid（瑞德）",
      kind: "local_book",
      tier: "traditional_reference",
      fileName: "手相-国际手相大师瑞德(彩色高清版)瑞德.pdf",
      sha256: "f6b000a30f9a7070238fe37dcab7097b83f18a3f5d61518f9e0e6172eda7040b",
      pdfPages: 96,
      summary: "彩色图解本，适合核对手型、主线、辅助线和应用章节的位置名称。",
      limitation: "书中解释属于传统掌相体系；扫描 PDF 有跳页，引用同时保留 PDF 页与书页。",
      catalogUrl: "https://openlibrary.org/books/OL6901527M/The_art_of_hand_reading",
      anchors: {
        "major-line-map": { locator: "PDF 5；书页 9", scope: "手掌、掌丘、主要掌纹与辅助掌纹位置图" },
        "hand-shapes": { locator: "PDF 6；书页 26", scope: "土、风、火、水四种手型分类" },
        "fate-line": { locator: "PDF 48-50；书页 70-72", scope: "命运线及起点、终点的传统解释" },
        "hand-difference": { locator: "PDF 54；书页 76", scope: "双手差异与左右手对照" },
        "sun-line": { locator: "PDF 56；书页 78", scope: "太阳线的位置和传统解释" },
        "auxiliary-lines": { locator: "PDF 62；书页 84", scope: "辅助线、金星带、直觉线等位置" },
        career: { locator: "PDF 74-78；书页 98-102", scope: "职业应用章节" },
        health: { locator: "PDF 80-84；书页 104-108", scope: "健康观察章节；只能作资料史对照" },
        change: { locator: "PDF 92；书页 116", scope: "成长、改变与掌线可变的传统表述" }
      }
    },
    "local.nuoyu": {
      shortLabel: "诺愚《手相学大全》",
      title: "《手相学大全》",
      author: "诺愚居士",
      kind: "local_book",
      tier: "traditional_reference",
      fileName: "手相学大全 (诺愚居士编著).pdf",
      sha256: "5568f13e648ca49c15b32c855e2507a44b4aea9444f58b2efd75b65a79c108e3",
      pdfPages: 188,
      summary: "纵排扫描本，系统整理手型、手指、指甲、掌丘、掌纹和流年图。",
      limitation: "作者在结论中明确承认手相缺少充分科学根据，因此只保留为传统分类来源。",
      anchors: {
        "scientific-limit": { locator: "PDF 6-9；书页 1-4", scope: "作者对命运决定论、准确性和科学根据的自我限制" },
        "hand-shapes": { locator: "PDF 10-11；书页 5-6", scope: "手型分类起始页" },
        "flow-chart": { locator: "PDF 56；书页 51", scope: "掌纹分布概况及传统流年图" },
        "life-line": { locator: "PDF 61；书页 56", scope: "生命线位置和形态分类" },
        "head-line": { locator: "PDF 75；书页 70", scope: "理智线位置和形态分类" },
        "heart-line": { locator: "PDF 93-106；书页 88-101", scope: "感情线位置和形态分类" },
        "success-line": { locator: "PDF 122；书页 117", scope: "成功线（太阳线）位置和分类" },
        "marriage-line": { locator: "PDF 130；书页 125", scope: "婚姻线位置；位于掌缘侧面" },
        "health-line": { locator: "PDF 147；书页 142", scope: "健康线传统分类；不得用于疾病诊断" }
      }
    },
    "local.chentai": {
      shortLabel: "陈泰先《手相面相全知道》",
      title: "《手相面相全知道：图文版》",
      author: "陈泰先",
      kind: "local_book",
      tier: "traditional_reference",
      fileName: "手相面相全知道 (陈泰先).pdf",
      sha256: "2ee19c7203c624d858c0401019ec2c17a9aed29db0f1776d8682ad81742fac17",
      pdfPages: 425,
      summary: "同时覆盖手相和面相，条目式汇编古文、民间信仰和术数解释。",
      limitation: "前言要求辨别神话、迷信和封建内容；可核对传统分类，不能当医学或人格测验。",
      catalogUrl: "https://huiwen.lsu.edu.cn/mspace/searchDetailLocal/m7eb2dd3fcb5813e12de3d34ee63a732d",
      anchors: {
        "author-boundary": { locator: "PDF 5、12；书页前言、1", scope: "编辑边界、时代局限和避免迷信的说明" },
        "palm-contents": { locator: "PDF 7-9；目录书页 1-3", scope: "手相各章、主要掌纹和流年章节定位" },
        "wealth-chapter": { locator: "PDF 8；目录书页 2；正文书页 129-135", scope: "事业与财富章节目录定位" },
        "life-line": { locator: "PDF 50；书页 39", scope: "生命线起始页" },
        "head-line": { locator: "PDF 58；书页 47", scope: "理智线起始页" },
        "heart-line": { locator: "PDF 69；书页 58", scope: "感情线起始页" },
        "wisdom-line": { locator: "PDF 79；书页 68", scope: "智慧线起始页" },
        "success-line": { locator: "PDF 81-82；书页 70-71", scope: "成功线及命运线起始页" },
        "face-overview": { locator: "PDF 204-205；书页 193-194", scope: "面相全观及十观的传统框架" },
        nose: { locator: "PDF 235；书页 224", scope: "鼻部传统分类起始页" },
        mouth: { locator: "PDF 243；书页 232", scope: "口唇传统分类起始页" },
        chin: { locator: "PDF 255-256；书页 244-245", scope: "下颌形态分类；短、圆、有肉等传统描述" }
      }
    },
    "local.culture": {
      shortLabel: "于元《手相与面相》",
      title: "《中国文化知识读本：手相与面相》",
      author: "金开诚主编，于元编著",
      kind: "local_book",
      tier: "cultural_history",
      fileName: "中国文化知识读本 手相与面相 (金开城主编；于元编著).pdf",
      sha256: "83ecf20aa5c9aa0bd2b773d74cfe480a4bf19cab8129c031be5c9cc916f148dd",
      pdfPages: 142,
      summary: "按先秦至明清分期介绍相术，主要价值是文化史脉络。",
      limitation: "历史叙述不能转化为个体预测准确性证据。",
      catalogUrl: "https://opac.uibe.edu.cn/opac/book/e874e5ef5013037fff1578ee7f59fcd5",
      anchors: {
        contents: { locator: "PDF 6；目录", scope: "先秦至明清相术章节结构" },
        history: { locator: "PDF 9-11；书页 3-5", scope: "相术起源和传统观念的历史叙述" }
      }
    },
    "local.suminfeng-bazi": {
      shortLabel: "苏民峰《八字论命》",
      title: "《苏民峰玄学锦囊：八字论命》",
      author: "苏民峰",
      kind: "local_book",
      tier: "traditional_reference",
      fileName: "八字论命苏民峰 (八字论命苏民峰) (z-library.sk, 1lib.sk, z-lib.sk).pdf",
      sha256: "4892a64b1d197f56dc38f6a90daebf69336d57d3d3338a40e1ef0b758daec4cf",
      pdfPages: 153,
      summary: "合订扫描本，覆盖寒热命论、月令与节气、六神、会合刑冲、取用、行运和流年流月。",
      limitation: "寒热、格局、用神和流年解释属于作者所用的传统命理体系；不同流派权重并不一致，不能据此保证具体事件。",
      catalogUrl: "https://www.airitibooks.com/Publication/Details?publicationID=P20170324368",
      anchors: {
        contents: { locator: "PDF 5-6；合订本目录", scope: "寒热命论、八字讲义、六神、会合刑冲、取用、行运和流年流月的章节定位" },
        "cold-heat": { locator: "PDF 7-8；书页 2-5", scope: "先看出生节令与寒、热、平命，再讨论五行取舍的传统次序" },
        "ten-gods": { locator: "PDF 26；书页 40-41", scope: "以日干为中心区分比肩、劫财、食伤、财、官杀与印的关系" },
        luck: { locator: "PDF 107；书页 202-203", scope: "原局与行运配合、喜忌随命局而定，不能只见一个字便断吉凶" },
        "annual-monthly": { locator: "PDF 122-123；书页 232-235", scope: "大运、流年与流月分层读取，年份只在原局和大运背景下成立" }
      }
    },
    "local.xuweigang-cases": {
      shortLabel: "徐伟刚《八字综合实例集》",
      title: "《八字综合实例集》",
      author: "徐伟刚",
      kind: "local_book",
      tier: "traditional_reference",
      fileName: "八字综合实例集 (八字综合实例集.pdf) (z-library.sk, 1lib.sk, z-lib.sk).pdf",
      sha256: "37cff97e03b60147d8578df80763c3e8384289bb9b5d43f83bb0cbd88cff6620",
      pdfPages: 66,
      summary: "以正官、偏官、印、财、伤官、食神和禄刃等格局配合大运、流年作案例对照。",
      limitation: "案例只能帮助检查论证是否前后一致，不能把别人的命例直接移植到当前个人，也不能由少量命例证明预测有效。",
      anchors: {
        contents: { locator: "PDF 3；目录页 1", scope: "七类格局案例与二十三个综合命例的结构" },
        method: { locator: "PDF 4-5；书页 2-3", scope: "先辨原局组合、再看取运，反对只凭一个十神或单一关系下结论" },
        examples: { locator: "PDF 6 起；书页 4 起", scope: "同一格局在强弱、搭配和行运不同情况下出现不同结果的案例对照" }
      }
    },
    "web.google-hand": {
      shortLabel: "Google Hand Landmarker",
      title: "MediaPipe Hand Landmarker for Web",
      author: "Google AI Edge",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js",
      fetchedAt: "2026-07-13",
      summary: "官方 Web 识别接口输出左右手、21 个图像坐标关键点和 21 个世界坐标关键点。",
      limitation: "它识别手部骨架关键点，不直接识别掌纹命理含义；同步推理会阻塞主线程。",
      anchors: {
        output: { locator: "官方文档 Handle and display results", scope: "21 个关键点、左右手和三维坐标输出" },
        performance: { locator: "官方文档 Run the task", scope: "同步调用阻塞 UI，建议 Web Worker" }
      }
    },
    "web.google-face": {
      shortLabel: "Google Face Landmarker",
      title: "MediaPipe Face Landmarker for Web",
      author: "Google AI Edge",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js",
      fetchedAt: "2026-07-13",
      summary: "官方 Web 识别接口输出 478 个面部关键点，并可选输出 52 个表情系数和变换矩阵。",
      limitation: "关键点可用于几何测量，但不能自动证明人格、财运或命运；同步推理应移出主线程。",
      anchors: {
        output: { locator: "官方文档 Handle and display results", scope: "478 个面部关键点、52 个 blendshape 和变换矩阵" },
        performance: { locator: "官方文档 Run the task", scope: "同步调用阻塞 UI，建议 Web Worker" }
      }
    },
    "web.apple-hand": {
      shortLabel: "Apple Vision Hand Pose",
      title: "VNDetectHumanHandPoseRequest",
      author: "Apple Developer Documentation",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://developer.apple.com/documentation/vision/vndetecthumanhandposerequest",
      fetchedAt: "2026-07-16",
      summary: "macOS Vision 原生请求可检测人手姿态并返回具名手部关节点观察。",
      limitation: "手部骨架关键点不等于掌褶分割，更不支持由掌纹推断人格、疾病或命运。",
      anchors: {
        output: { locator: "Accessing the Results and Determining Supported Joints", scope: "手部姿态观察、关节点名称和最大手数" },
        multi: { locator: "maximumHandCount", scope: "检测手数上限；结果按相对大小排序，只有较大手获得关键点" }
      }
    },
    "web.apple-image-orientation": {
      shortLabel: "Apple Vision Image Orientation",
      title: "VNImageRequestHandler",
      author: "Apple Developer Documentation",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://developer.apple.com/documentation/vision/vnimagerequesthandler",
      fetchedAt: "2026-07-16",
      summary: "Vision 单图请求处理器支持在创建时传入已知图像方向，避免像素方向与显示方向不一致。",
      limitation: "正确传入方向只改善几何坐标解释，不保证低清、遮挡或模糊照片仍能可靠识别掌褶和面部细节。",
      anchors: {
        orientation: { locator: "Creating a Request Handler: image with known orientation", scope: "单图识别的方向元数据处理" }
      }
    },
    "web.apple-contours": {
      shortLabel: "Apple Vision Contours",
      title: "VNDetectContoursRequest and VNContour",
      author: "Apple Developer Documentation",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://developer.apple.com/documentation/vision/vndetectcontoursrequest",
      fetchedAt: "2026-07-16",
      summary: "macOS Vision 原生轮廓请求检测图像边缘，并输出由归一化点列构成的轮廓；可设置明暗方向、对比度和最大处理尺寸。",
      limitation: "通用图像轮廓只证明照片中存在边缘片段，不等于掌褶中心线分割，更不能自动命名生命线、太阳线、财运纹或推断命运。",
      anchors: {
        output: { locator: "Detecting Contours and VNContour normalizedPoints", scope: "轮廓观察、归一化点列、对比度和处理尺寸" },
        boundary: { locator: "VNContour polygon and hierarchy", scope: "图像边缘几何不是掌纹语义分类" }
      }
    },
    "web.palm-line-hysteresis": {
      shortLabel: "掌纹双阈值提取研究",
      title: "Line Extraction in Palmprint System",
      author: "Fang Li, Maylor K. H. Leung, Chan Sin Wai",
      kind: "peer_reviewed",
      tier: "measurement_peer_reviewed",
      url: "https://doi.org/10.7763/IJCTE.2012.V4.533",
      fetchedAt: "2026-07-13",
      summary: "掌纹生物识别研究使用滞后双阈值保留与强响应连通的弱线像素，为后续线特征提取提供基础。",
      limitation: "研究目标是受控掌纹图像的生物识别预处理，不证明普通自拍下的命理线分类，更不支持人格、健康或命运推断。",
      anchors: {
        method: { locator: "Abstract and line-extraction method", scope: "掌纹线提取中的双阈值连通思路" }
      }
    },
    "web.palm-crease-roi": {
      shortLabel: "掌褶ROI提取研究",
      title: "Automatic Extraction of Two Regions of Creases from Palmprint Images for Biometric Identification",
      author: "Yaacob et al.",
      kind: "peer_reviewed",
      tier: "measurement_peer_reviewed",
      url: "https://doi.org/10.1155/2019/5128062",
      fetchedAt: "2026-07-13",
      summary: "研究以掌区分割、降采样、阈值、形态操作和直线变换提取特定掌褶区域，强调先限定ROI再处理。",
      limitation: "该方法只验证特定掌褶区域与生物识别数据，不等于任意掌照的完整主线分割或传统手相语义识别。",
      anchors: {
        method: { locator: "Methods: segmentation, thresholding, morphology and Hough transform", scope: "掌褶ROI与有界图像处理流程" }
      }
    },
    "web.apple-face": {
      shortLabel: "Apple Vision Face Landmarks",
      title: "VNDetectFaceLandmarksRequest and VNFaceLandmarks2D",
      author: "Apple Developer Documentation",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://developer.apple.com/documentation/vision/vndetectfacelandmarksrequest",
      fetchedAt: "2026-07-16",
      summary: "macOS Vision 原生请求检测面部及眼、眉、鼻、嘴和脸部轮廓关键区。",
      limitation: "Vision 不直接提供真实发际线点；人脸框估算不得获得三庭已测量权限，也不得用于人格或命运断言。",
      anchors: {
        output: { locator: "Locating Face Landmarks and Accessing the Results", scope: "面部观察、五官关键区和轮廓点" },
        multi: { locator: "Overview and results: [VNFaceObservation]", scope: "默认先定位输入图中的全部人脸，再逐脸分析关键特征" }
      }
    },
    "web.apple-face-quality": {
      shortLabel: "Apple Vision Face Capture Quality",
      title: "VNDetectFaceCaptureQualityRequest",
      author: "Apple Developer Documentation",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://developer.apple.com/documentation/vision/vndetectfacecapturequalityrequest",
      fetchedAt: "2026-07-16",
      summary: "macOS Vision 原生请求输出 0 至 1 的人脸照片捕获质量，用于比较同一人的多张照片；较高分通常对应更合适的光线、清晰度和主体位置。",
      limitation: "该分数只能辅助筛选照片可测性，且官方主要建议在同一人的照片集合内比较；本站 0.50 门槛是用本人原图及受控降质图建立的项目门槛，不是通用审美、健康或命运标准。",
      anchors: {
        score: { locator: "Overview and faceCaptureQuality", scope: "分数范围、光线/清晰度/主体位置含义及同一人多图比较边界" }
      }
    },
    "web.nist-face-quality": {
      shortLabel: "NIST Face Image Quality",
      title: "Face Image Quality Standardization",
      author: "National Institute of Standards and Technology",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://pages.nist.gov/ifpc/2022/presentations/9_grother_face_q.pdf",
      fetchedAt: "2026-07-16",
      summary: "NIST 人脸图像质量标准化材料把照明均匀性、姿态、分辨率和清晰度等作为可分解质量因素。",
      limitation: "质量指标只能决定图像是否适合测量或需要重拍，不能由面部图像推出人格、疾病、财运或确定命运。",
      anchors: {
        factors: { locator: "ISO/IEC 29794-5 quality components", scope: "照明、姿态、分辨率与清晰度的质量控制" }
      }
    },
    "web.iso-face-quality-2025": {
      shortLabel: "ISO 人脸图像质量标准",
      title: "ISO/IEC 29794-5:2025 — Biometric sample quality — Face image data",
      author: "ISO/IEC JTC 1/SC 37",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://www.iso.org/standard/81005.html",
      fetchedAt: "2026-07-24",
      summary: "2025版国际标准规定单张人脸图像质量属性的量化要求，用于判断图像与规范化人脸样本要求的符合程度。",
      limitation: "标准评估的是单张图像可用性，不比较两个人或多张图，也不支持由面部形态推断人格、健康、财运或命运。",
      anchors: {
        scope: { locator: "Abstract and scope", scope: "单张人脸图像质量、规范样本符合度及明确排除多图比较的边界" }
      }
    },
    "web.nist-face-defects": {
      shortLabel: "NIST FATE 图像缺陷评估",
      title: "FATE Part 11: Face Image Quality Vector Assessment — Specific Image Defect Detection",
      author: "Yang, Grother, Ngan, Hanaoka and Hom; NIST",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://www.nist.gov/publications/face-analysis-technology-evaluation-fate-part-11-face-image-quality-vector-assessment",
      fetchedAt: "2026-07-24",
      summary: "NISTIR 8485按具体图像缺陷评估人脸质量向量，支持把姿态、照明、清晰度等问题拆开记录，而不是压成一个含义不明的总分。",
      limitation: "缺陷检测只决定图像是否适合后续测量或应当重拍，不能据此评价颜值、人格、疾病或传统面相吉凶。",
      anchors: {
        defects: { locator: "NISTIR 8485 title, abstract and evaluation scope", scope: "人脸图像具体缺陷和分项质量评估" }
      }
    },
    "web.palmar-anatomy": {
      shortLabel: "掌褶解剖研究",
      title: "Can palmar creases serve as landmarks for the deeper neuro-vascular structures?",
      author: "Peer-reviewed anatomical study",
      kind: "peer_reviewed",
      tier: "medical_peer_reviewed",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4061464/",
      fetchedAt: "2026-07-13",
      summary: "掌褶形成于胎儿期，主要掌褶在位置和长度上存在个体差异。",
      limitation: "解剖与发育关联不等于能由掌纹预测寿命、职业或婚姻。",
      anchors: {
        "normal-variation": { locator: "Discussion", scope: "掌褶的胎儿期形成、个体差异和解释限制" }
      }
    },
    "web.palmar-morphology": {
      shortLabel: "掌褶形态定义",
      title: "Defining Morphology: Hands and Feet",
      author: "American Journal of Medical Genetics terminology group",
      kind: "peer_reviewed",
      tier: "medical_peer_reviewed",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3224990/",
      fetchedAt: "2026-07-13",
      summary: "给出三条主要掌褶及单一横掌褶等可观察形态的标准定义。",
      limitation: "部分深浅判断仍具有主观性，需要有经验的观察者；单张照片不能诊断。",
      anchors: {
        definitions: { locator: "Creases section", scope: "主要掌褶、单一横掌褶和主观性说明" }
      }
    },
    "web.face-anthropometry": {
      shortLabel: "亚洲面部测量共识",
      title: "A New Simplified Visual Assessment Tool Describing Facial Morphotypes Observed and Desired in Asian Populations",
      author: "Asian aesthetic physician consensus study",
      kind: "peer_reviewed",
      tier: "measurement_peer_reviewed",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7605391/",
      fetchedAt: "2026-07-13",
      summary: "用发际、眉间、鼻下点、口裂点和软组织颏下点定义面部三庭及下庭内部比例。",
      limitation: "研究同时显示亚洲内部存在地区和性别差异，比例只能作测量参照，不能作为统一审美或命运标准。",
      anchors: {
        thirds: { locator: "Table 3", scope: "三庭与下庭一分上唇、二分下唇和下巴的测量方法" }
      }
    },
    "web.face-reference-data": {
      shortLabel: "东亚面部参考数据",
      title: "Photo anthropometric variations in Japanese facial features",
      author: "Forensic Science International research team",
      kind: "peer_reviewed",
      tier: "measurement_peer_reviewed",
      url: "https://pubmed.ncbi.nlm.nih.gov/26341158/",
      fetchedAt: "2026-07-13",
      summary: "1126 名日本成人的三维照片参考数据，使用 22 个人体测量标志点。",
      limitation: "人群参考值不能无条件外推到不同族群、年龄、拍摄姿势或二维自拍。",
      anchors: {
        landmarks: { locator: "Methods and abstract", scope: "东亚成人面部标志点与三维测量基准" }
      }
    },
    "web.face-validity": {
      shortLabel: "面孔归因有效性综述",
      title: "Social attributions from faces: determinants, consequences, accuracy, and functional significance",
      author: "Todorov et al., Annual Review of Psychology",
      kind: "peer_reviewed",
      tier: "scientific_boundary",
      url: "https://pubmed.ncbi.nlm.nih.gov/25196277/",
      fetchedAt: "2026-07-13",
      summary: "人们会快速形成一致的面孔印象，但综述认为这些归因的诊断有效性被明显夸大。",
      limitation: "网站不得把第一印象、一致评价或相关性写成真实人格和未来命运。",
      anchors: {
        validity: { locator: "Review abstract and Section IV", scope: "面孔社会归因的准确性限制" }
      }
    },
    "web.palmistry-boundary": {
      shortLabel: "掌相科学边界综述",
      title: "Metoposcopy redux",
      author: "Toren et al., Clinics in Dermatology",
      kind: "peer_reviewed",
      tier: "scientific_boundary",
      url: "https://pubmed.ncbi.nlm.nih.gov/37924996/",
      fetchedAt: "2026-07-13",
      summary: "皮肤科历史综述把由掌纹或面部线纹断人格与未来归入占卜/伪科学传统。",
      limitation: "传统规则可以作为民俗叙事或自我反思提示，不能声称经过科学验证。",
      anchors: {
        validity: { locator: "Abstract", scope: "掌相、额纹相法与人格/未来预测的科学边界" }
      }
    },
    "web.face-ai-caveats": {
      shortLabel: "面部 AI 偏差综述",
      title: "Artificial intelligence in medico-dental diagnostics of the face: opportunities and challenges",
      author: "Peer-reviewed narrative review",
      kind: "peer_reviewed",
      tier: "scientific_boundary",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9708749/",
      fetchedAt: "2026-07-13",
      summary: "面部 AI 会受表情、图像质量、数据集和其他混杂因素影响，低置信时应拒绝预测。",
      limitation: "识别系统必须保留低置信、姿态和人群偏差提示，不能强行给结论。",
      anchors: {
        confounders: { locator: "Addressing confounders and unsafe failure mode", scope: "表情、数据偏差、低置信与拒判机制" }
      }
    },
    "web.lunar-javascript": {
      shortLabel: "lunar-javascript 1.7.7",
      title: "6tail/lunar-javascript calendar engine",
      author: "6tail open-source project",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://github.com/6tail/lunar-javascript/tree/v1.7.7",
      fetchedAt: "2026-07-16",
      summary: "本地懒加载历法引擎按阳历时刻、节气交接和干支规则生成四柱，并提供起运与大运时间段。",
      limitation: "它验证的是历法计算实现，不证明八字预测具有科学有效性；出生时区、真太阳时和流派差异仍需明确。",
      anchors: {
        "eight-char": { locator: "README, Lunar.getEightChar and EightChar API", scope: "年、月、日、时四柱计算" },
        "exact-ganzhi": { locator: "Lunar exact GanZhi API and Yun/DaYun API", scope: "节气交接、精确干支、起运与大运时间段" }
      }
    },
    "web.browser-idle": {
      shortLabel: "MDN 空闲任务调度",
      title: "Window: requestIdleCallback() method",
      author: "MDN Web Docs",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback",
      fetchedAt: "2026-07-16",
      summary: "浏览器可在主线程空闲期执行低优先级工作；必要任务应设置正数 timeout，并为不支持该接口的环境保留定时器兜底。",
      limitation: "空闲回调只改变调度时机，不能替代任务分块、数量上限和真实耗时验证。",
      anchors: {
        scheduling: { locator: "Description, options.timeout and browser compatibility", scope: "低优先级启动工作、timeout 与兼容兜底" }
      }
    },
    "web.html-dynamic-script": {
      shortLabel: "WHATWG 动态脚本规范",
      title: "HTML Standard: The script element",
      author: "WHATWG",
      kind: "official_technical",
      tier: "technical_primary",
      url: "https://html.spec.whatwg.org/multipage/scripting.html#the-script-element",
      fetchedAt: "2026-07-16",
      summary: "HTML 标准定义脚本元素的 parser-inserted、async 与动态插入执行模型，为非首屏本地脚本按需加载提供行为依据。",
      limitation: "异步动态插入不自动保证业务顺序；调用方仍需以单一 Promise 去重、等待 load 并处理 error。",
      anchors: {
        dynamic: { locator: "The script element: async and force async", scope: "动态脚本的异步执行与显式完成/失败处理" }
      }
    }
  };

  const baseRefs = {
    palm: [
      "web.apple-hand#output",
      "web.apple-hand#multi",
      "web.apple-image-orientation#orientation",
      "web.apple-contours#output",
      "web.apple-contours#boundary",
      "web.palm-line-hysteresis#method",
      "web.palm-crease-roi#method",
      "web.google-hand#output",
      "web.google-hand#performance",
      "web.palmar-anatomy#normal-variation",
      "web.palmar-morphology#definitions",
      "web.palmistry-boundary#validity"
    ],
    face: [
      "web.apple-face#output",
      "web.apple-face#multi",
      "web.apple-face-quality#score",
      "web.apple-contours#output",
      "web.apple-image-orientation#orientation",
      "web.nist-face-quality#factors",
      "web.iso-face-quality-2025#scope",
      "web.nist-face-defects#defects",
      "web.google-face#output",
      "web.google-face#performance",
      "web.face-anthropometry#thirds",
      "web.face-reference-data#landmarks",
      "web.face-validity#validity",
      "web.face-ai-caveats#confounders"
    ],
    bazi: [
      "web.lunar-javascript#eight-char",
      "web.lunar-javascript#exact-ganzhi",
      "local.suminfeng-bazi#cold-heat",
      "local.suminfeng-bazi#ten-gods",
      "local.suminfeng-bazi#luck",
      "local.suminfeng-bazi#annual-monthly",
      "local.xuweigang-cases#method",
      "local.xuweigang-cases#examples"
    ]
  };

  function resolve(ref) {
    const raw = String(ref || "");
    const separator = raw.indexOf("#");
    const sourceId = separator >= 0 ? raw.slice(0, separator) : raw;
    const anchorId = separator >= 0 ? raw.slice(separator + 1) : "";
    const source = sources[sourceId];
    if (!source) return null;
    const anchor = anchorId && source.anchors ? source.anchors[anchorId] : null;
    const tier = tiers[source.tier] || tiers.traditional_reference;
    return {
      ref: raw,
      sourceId,
      anchorId,
      shortLabel: source.shortLabel,
      title: source.title,
      author: source.author,
      kind: source.kind,
      tierKey: source.tier,
      tierLabel: tier.label,
      tierTone: tier.tone,
      tierMeaning: tier.meaning,
      locator: anchor ? anchor.locator : "",
      scope: anchor ? anchor.scope : source.summary,
      summary: source.summary,
      limitation: source.limitation,
      url: source.url || source.catalogUrl || "",
      fetchedAt: source.fetchedAt || "",
      fileName: source.fileName || "",
      sha256: source.sha256 || ""
    };
  }

  function uniqueRefs(refs) {
    return Array.from(new Set((Array.isArray(refs) ? refs : []).filter(Boolean)));
  }

  function citationSnapshot(refs) {
    const unique = uniqueRefs(refs);
    return {
      registryVersion,
      verifiedAt: "2026-07-24",
      refs: unique,
      items: unique.map(resolve).filter(Boolean),
      boundaries: [
        "traditional_sources_are_not_scientific_validation",
        "no_medical_diagnosis_from_images",
        "no_personality_or_fate_certainty_from_face_or_palm",
        "low_confidence_requires_review_or_more_images"
      ]
    };
  }

  root.PalmFaceSourceRegistry = Object.freeze({
    version: registryVersion,
    verifiedAt: "2026-07-24",
    tiers,
    sources,
    baseRefs,
    resolve,
    uniqueRefs,
    citationSnapshot
  });
})(typeof window !== "undefined" ? window : globalThis);
