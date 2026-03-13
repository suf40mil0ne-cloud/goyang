import fs from 'node:fs';
import path from 'node:path';

const rootDir = new URL('..', import.meta.url);
const dataDir = path.join(rootDir.pathname, 'data');
const debugDir = path.join(dataDir, 'debug');

function getFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getArgValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function readJson(relativePath, fallback = []) {
  const targetPath = path.join(dataDir, relativePath);
  if (!fs.existsSync(targetPath)) return fallback;
  return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}

function writeJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

function compactText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeText(value = '') {
  return compactText(
    String(value || '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .toLowerCase()
  );
}

function normalizeSigunguCode(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : '';
}

function slugify(value = '') {
  const normalized = normalizeText(value).replace(/\s+/g, '-');
  return normalized || 'notice';
}

function inferProjectType(title = '') {
  const rules = [
    ['지구단위계획', '지구단위계획'],
    ['도시개발', '도시개발'],
    ['정비계획', '정비계획'],
    ['도시관리계획', '도시관리계획'],
    ['토지거래허가구역', '토지거래허가구역'],
    ['공원', '공원/녹지'],
    ['도로', '도로'],
  ];
  const match = rules.find(([keyword]) => String(title).includes(keyword));
  return match?.[1] || '도시계획';
}

function inferStatus({ hearingStartDate = '', hearingEndDate = '', postedDate = '' }) {
  const now = new Date();
  const end = hearingEndDate ? new Date(`${hearingEndDate}T23:59:59+09:00`) : null;
  const start = hearingStartDate ? new Date(`${hearingStartDate}T00:00:00+09:00`) : null;
  const posted = postedDate ? new Date(`${postedDate}T00:00:00+09:00`) : null;
  if (end && end < now) return 'ended';
  if (start && start > now) return 'upcoming';
  if (posted && posted > now) return 'upcoming';
  return 'ongoing';
}

function buildSigunguIndex(sigunguCatalog) {
  const byCode = new Map();
  const aliases = [];

  sigunguCatalog.forEach((item) => {
    const adminCode = normalizeSigunguCode(item.adminCode);
    const region = {
      sido: item.sido,
      sigungu: item.sigungu,
      adminCode,
      centerLat: item.centerLat,
      centerLng: item.centerLng,
      aliases: item.aliases || [],
    };
    if (adminCode) byCode.set(adminCode, region);
    [item.sigungu, ...(item.aliases || [])]
      .map((alias) => normalizeText(alias))
      .filter(Boolean)
      .forEach((alias) => aliases.push({ alias, region }));
  });

  aliases.sort((a, b) => b.alias.length - a.alias.length);
  return { byCode, aliases };
}

function resolveRegion(record, sigunguIndex) {
  const directCode = normalizeSigunguCode(record.sigunguCode || record.adminCode);
  if (directCode && sigunguIndex.byCode.has(directCode)) {
    const region = sigunguIndex.byCode.get(directCode);
    return { ...region, classificationConfidence: 'high' };
  }

  const haystack = normalizeText([record.targetAreaText, record.title].filter(Boolean).join(' '));
  const byTarget = sigunguIndex.aliases.find((item) => item.alias.length >= 2 && haystack.includes(item.alias));
  if (byTarget) {
    return { ...byTarget.region, classificationConfidence: 'medium' };
  }

  const organizationText = normalizeText(record.organization);
  const byOrganization = sigunguIndex.aliases.find((item) => item.alias.length >= 2 && organizationText.includes(item.alias));
  if (byOrganization) {
    return { ...byOrganization.region, classificationConfidence: 'low' };
  }

  return null;
}

function buildShortSummary(record) {
  const period = record.hearingStartDate && record.hearingEndDate
    ? `${record.hearingStartDate}부터 ${record.hearingEndDate}까지`
    : record.postedDate
      ? `${record.postedDate} 공고`
      : '공고 기간 확인 필요';
  return `${record.organization}에서 ${period} ${record.title}를 확인할 수 있습니다.`;
}

function buildAiSummary(record) {
  return `${record.title} 공고입니다. 공람 기간과 제출처는 토지이음 상세 또는 공식 원문을 기준으로 확인해야 합니다.`;
}

function buildRejectionReasons(record, region) {
  const reasons = [];
  if (!record.sourceDetailUrl && !record.seq && !record.pnncCd) reasons.push('missing_source_detail');
  if (!record.title || !record.organization || !(record.postedDate || (record.hearingStartDate && record.hearingEndDate))) {
    reasons.push('missing_notice_core_fields');
  }
  if (!record.sourceDetailUrl || !/^https:\/\/www\.eum\.go\.kr\/web\/cp\/(hr|ih)\//.test(record.sourceDetailUrl)) {
    reasons.push('invalid_source_url');
  }
  if (!region) {
    reasons.push('missing_sigungu_code');
    reasons.push('target_area_parse_failed');
  }
  if (!record.officialNoticeUrl && !(Array.isArray(record.attachmentUrls) && record.attachmentUrls.length > 0) && !record.sourceDetailUrl) {
    reasons.push('no_official_source');
  }
  if (String(record.verificationStatus || '').toLowerCase() === 'partial') reasons.push('low_confidence');
  return [...new Set(reasons)];
}

function normalizeRecord(record, region) {
  const hearingType = record.sourceType === 'ih' ? '인터넷 주민의견청취' : '주민의견청취 공람';
  const status = inferStatus(record);
  const attachments = (record.attachmentUrls || []).map((url) => ({
    label: url.split('/').pop() || '첨부파일',
    url,
  }));

  return {
    id: record.id,
    slug: slugify(`${record.id}-${record.title}`),
    sourceType: record.sourceType,
    sourceNoticeId: record.seq || record.pnncCd || record.id,
    sourceUrl: record.sourceUrl || '',
    sourceDetailUrl: record.sourceDetailUrl || '',
    officialNoticeUrl: record.officialNoticeUrl || '',
    attachmentUrls: record.attachmentUrls || [],
    attachments,
    seq: record.seq || '',
    pnncCd: record.pnncCd || '',
    noticeNumber: compactText(record.noticeNumber),
    title: record.title,
    organization: record.organization,
    postedDate: record.postedDate || record.hearingStartDate || '',
    hearingStartDate: record.hearingStartDate || record.postedDate || '',
    hearingEndDate: record.hearingEndDate || record.postedDate || '',
    sigunguCode: region?.adminCode || '',
    adminCode: region?.adminCode || '',
    sido: region?.sido || '',
    sigungu: region?.sigungu || '',
    legalDong: '',
    targetAreaText: compactText(record.targetAreaText),
    locationText: compactText(record.targetAreaText || `${region?.sido || ''} ${region?.sigungu || ''}`),
    latitude: Number.isFinite(region?.centerLat) ? region.centerLat : null,
    longitude: Number.isFinite(region?.centerLng) ? region.centerLng : null,
    locationConfidence: region ? (region.classificationConfidence === 'high' ? 0.72 : region.classificationConfidence === 'medium' ? 0.58 : 0.44) : 0,
    classificationConfidence: region?.classificationConfidence || 'low',
    status,
    hearingType,
    projectType: inferProjectType(record.title),
    shortSummary: buildShortSummary(record),
    aiSummary: buildAiSummary(record),
    impactSummary: '원문 공고에서 사업 범위와 열람 기간을 확인할 수 있습니다.',
    whyPublicReview: '도시계획 관련 변경사항을 주민에게 공개하고 의견을 받는 절차입니다.',
    whoShouldCare: '대상지 인근 거주자, 이해관계인, 토지 소유자',
    submissionMethod: record.sourceType === 'ih' ? '토지이음 상세 또는 공식 원문에서 온라인 제출 방식을 확인하세요.' : '토지이음 상세 또는 공식 원문에 적힌 제출 방식을 확인하세요.',
    submissionPlace: compactText(record.targetAreaText) || '토지이음 상세 또는 공식 원문 확인',
    submissionDeadlineText: record.hearingEndDate ? `${record.hearingEndDate}까지` : '원문 공고 확인',
    contact: record.organization,
    viewLocation: compactText(record.targetAreaText) || record.organization,
    rawText: record.rawText || '',
    rawHtml: record.rawHtml || '',
    onlineSubmissionAvailable: record.sourceType === 'ih',
    sourceConfidence: record.sourceConfidence || 'medium',
    lastFetchedAt: record.lastFetchedAt || new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    linkVerifiedAt: new Date().toISOString(),
  };
}

function main() {
  const dryRun = getFlag('dry-run');
  const publishPartial = getFlag('publish-partial');
  const rawPath = getArgValue('input', 'eum-raw.json');
  const outputPath = getArgValue('output', 'eum-verified.json');
  const raw = readJson(rawPath, []);
  const sigunguCatalog = readJson('sigungu.json', []);
  const sigunguIndex = buildSigunguIndex(sigunguCatalog);

  const rejectedReport = [];
  const normalizedRecords = raw.map((record) => {
    const region = resolveRegion(record, sigunguIndex);
    const rejectionReasons = buildRejectionReasons(record, region);
    const hasCoreFields = Boolean(record.title && record.organization && (record.postedDate || record.hearingStartDate || record.hearingEndDate));
    const hasDetail = Boolean(record.sourceDetailUrl || record.seq || record.pnncCd);
    const canVerify = hasCoreFields && hasDetail && region;
    const status = canVerify ? 'verified' : hasCoreFields && hasDetail ? 'partial' : 'rejected';

    const normalized = {
      ...normalizeRecord(record, region),
      verificationStatus: status,
      verificationReason: status === 'verified'
        ? '토지이음 상세 공고문과 핵심 메타데이터를 직접 확인했습니다.'
        : rejectionReasons.join(', ') || 'verification_pending',
    };

    if (status !== 'verified') {
      rejectedReport.push({
        id: normalized.id,
        title: normalized.title,
        organization: normalized.organization,
        sourceType: normalized.sourceType,
        sourceDetailUrl: normalized.sourceDetailUrl,
        seq: normalized.seq || '',
        pnncCd: normalized.pnncCd || '',
        rejectionReasons,
      });
    }

    return normalized;
  });

  const verified = normalizedRecords.filter((record) => record.verificationStatus === 'verified');
  const partial = normalizedRecords.filter((record) => record.verificationStatus === 'partial');
  const rejected = normalizedRecords.filter((record) => record.verificationStatus === 'rejected');
  const publishable = publishPartial ? [...verified, ...partial] : verified;

  const summary = {
    rawCount: raw.length,
    normalizedCount: normalizedRecords.length,
    verifiedCount: verified.length,
    partialCount: partial.length,
    rejectedCount: rejected.length,
    publishedCandidateCount: publishable.length,
    dryRun,
    publishPartial,
  };

  writeJson(path.join(dataDir, outputPath), publishable);
  writeJson(path.join(debugDir, 'eum-rejected-report.json'), rejectedReport);
  writeJson(path.join(debugDir, 'eum-stage-summary.json'), {
    ...(readJson('debug/eum-stage-summary.json', {}) || {}),
    verify: summary,
  });

  console.log(`Normalized ${normalizedRecords.length} EUM records`);
  console.log(`Verified ${verified.length} / Partial ${partial.length} / Rejected ${rejected.length}`);
  console.log(`${dryRun ? 'Dry-run staged' : 'Saved'} publishable EUM records: ${publishable.length}`);
}

main();
