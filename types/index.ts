export type ActivityLevel = 'info' | 'success' | 'warning' | 'error';
export type ScanActivity = {
  timestamp: string;
  step: string;
  message: string;
  level: ActivityLevel;
  durationMs?: number;
};

export type IssueCategory = 'availability' | 'links' | 'seo' | 'performance' | 'accessibility' | 'best-practices';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssueDetail = {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  url?: string;
  what: string;
  impact: string;
  recommendation: string;
  source?: string;
};

export type LinkIssue = { url: string; status: number | null; message: string };
export type CrawlRedirect = { from: string; to: string; status: number };
export type PageSeo = {
  url: string;
  status: number;
  title: string;
  titleLength: number;
  description: string;
  h1Count: number;
  h1Texts: string[];
  images: number;
  imagesMissingAlt: number;
  missingAltImages: string[];
  canonical: string;
  issues: string[];
};
export type SpeedAudit = {
  id: string;
  title: string;
  description: string;
  displayValue?: string;
  score: number | null;
};
export type SpeedMetrics = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  findings: SpeedAudit[];
  error?: string;
};
export type CrawlConfiguration = { limit: number; sitemapEnabled: boolean; sitemapUrlsDiscovered: number; sitemapSources: string[] };
export type ScanResult = {
  id: string;
  checkedAt: string;
  siteUrl: string;
  overallStatus: 'healthy' | 'issues' | 'down';
  uptime: { ok: boolean; status: number | null; responseMs: number | null; error?: string };
  pagesChecked: number;
  linksChecked: number;
  /** Requested crawl settings and sitemap discovery details. Optional for older saved scans. */
  crawlConfig?: CrawlConfiguration;
  linkIssues: LinkIssue[];
  /** Redirect hops observed while crawling. Optional for compatibility with older saved scans. */
  redirects?: CrawlRedirect[];
  seoPages: PageSeo[];
  speed: SpeedMetrics;
  detailedIssues: IssueDetail[];
  activities: ScanActivity[];
  aiSummary: string;
  recommendations: string[];
  warnings: string[];
};


export type IssueWorkflowStatus = 'open' | 'in_progress' | 'fixed' | 'ignored';
export type IssueTrackingRecord = {
  siteHost: string;
  issueKey: string;
  issueTitle: string;
  category: IssueCategory;
  severity: IssueSeverity;
  url: string;
  status: IssueWorkflowStatus;
  owner: string;
  notes: string;
  updatedAt: string;
};

export type MonitoredSite = {
  id: string;
  url: string;
  name?: string;
  isActive: boolean;
  crawlLimit: number;
  checkIntervalMinutes: number;
  alertEmail?: string;
  lastStatus: 'healthy' | 'issues' | 'down' | 'unknown';
  lastStatusCode?: number | null;
  lastCheckedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmailNotificationStatus = 'pending' | 'accepted' | 'failed' | 'skipped';
export type EmailNotificationEvent = {
  id: string;
  siteUrl: string;
  notificationType: string;
  triggerReason: string;
  status: EmailNotificationStatus;
  providerMessageId?: string | null;
  errorReason?: string | null;
  createdAt: string;
};
