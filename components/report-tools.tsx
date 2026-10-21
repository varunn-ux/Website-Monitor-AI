'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, FileSpreadsheet, FileText, GitCompareArrows, Minus, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { IssueDetail, ScanResult } from '@/types';
import { getCmsGuidance } from '@/lib/cms-guidance';
import { explainPageSpeedError, hasLighthouseData, uniqueActivities } from '@/lib/presentation';
import { isSameSite } from '@/lib/url-identity';

type Props = { current: ScanResult; previous: ScanResult | null; history?: ScanResult[] };

function safeFilePart(value: string) {
  return value.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'website';
}
function printable(value: unknown) {
  return String(value ?? '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}
function csvCell(value: unknown) {
  let text = String(value ?? '');
  // Prevent website-supplied strings from being interpreted as formulas by Excel.
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function downloadBlob(content: BlobPart, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function issueList(scan: ScanResult): IssueDetail[] {
  return Array.isArray(scan.detailedIssues) ? scan.detailedIssues : [];
}
function normalizedIssueKey(issue: IssueDetail) {
  const path = issue.url ? (() => { try { return new URL(issue.url).pathname.replace(/\/$/, '') || '/'; } catch { return issue.url; } })() : '/';
  const title = issue.title.toLowerCase()
    .replace(/mobile performance score is \d+\/100/, 'mobile performance score')
    .replace(/\b\d+\/100\b/g, 'score')
    .replace(/\s+/g, ' ').trim();
  return `${path}|${title}`;
}

function sameSite(a: string, b: string) {
  return isSameSite(a, b);
}
function deltaText(current: number | null | undefined, previous: number | null | undefined, digits = 0, suffix = '') {
  if (current == null || previous == null) return 'Unavailable';
  const delta = current - previous;
  const value = Math.abs(delta).toFixed(digits);
  return `${delta > 0 ? '+' : delta < 0 ? '-' : ''}${value}${suffix}`;
}
function metricValue(scan: ScanResult, key: 'performance' | 'accessibility' | 'bestPractices' | 'seo') {
  return scan.speed?.[key] ?? null;
}
function scoreName(key: string) {
  return ({ performance: 'Performance', accessibility: 'Accessibility', bestPractices: 'Best practices', seo: 'SEO' } as Record<string, string>)[key] ?? key;
}

function scansForWebsite(current: ScanResult, history: ScanResult[]) {
  const relevant = history.filter((scan) => sameSite(scan.siteUrl, current.siteUrl) && scan.checkedAt <= current.checkedAt);
  const unique = new Map<string, ScanResult>();
  relevant.forEach((scan) => unique.set(scan.id, scan));
  unique.set(current.id, current);
  return Array.from(unique.values()).sort((a, b) => a.checkedAt.localeCompare(b.checkedAt)).slice(-10);
}

function drawBarChartPng(title: string, labels: string[], values: Array<number | null>, colors: string[], maxScale?: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = Math.max(350, 140 + labels.length * 45);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare an Excel chart image.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#142b59'; context.font = 'bold 31px Arial'; context.fillText(title, 36, 46);
  const hasAnyValue = values.some((value) => typeof value === 'number' && Number.isFinite(value));
  if (!hasAnyValue) {
    context.fillStyle = '#92400e'; context.font = '18px Arial';
    context.fillText('No verified PageSpeed scores were returned for this scan.', 36, 78);
  }
  const max = maxScale ?? Math.max(1, ...values.map((value) => value ?? 0));
  const labelWidth = 290; const barArea = 610; const startY = 100; const rowGap = 43;
  labels.forEach((label, index) => {
    const y = startY + index * rowGap;
    const value = values[index];
    context.fillStyle = '#334155'; context.font = '22px Arial'; context.fillText(label.length > 26 ? `${label.slice(0, 23)}…` : label, 36, y + 20);
    context.fillStyle = '#e2e8f0'; context.fillRect(labelWidth, y, barArea, 25);
    if (value !== null && value !== undefined) {
      context.fillStyle = colors[index] ?? '#2563eb'; context.fillRect(labelWidth, y, Math.max(0, (value / max) * barArea), 25);
      context.fillStyle = '#0f172a'; context.font = 'bold 20px Arial'; context.fillText(String(Number(value.toFixed(2))), labelWidth + barArea + 14, y + 20);
    } else {
      context.fillStyle = '#64748b'; context.font = '18px Arial'; context.fillText('Unavailable', labelWidth + 12, y + 19);
    }
  });
  return canvas.toDataURL('image/png');
}

function drawScoreTrendPng(scans: ScanResult[]) {
  const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 430;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare an Excel chart image.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#142b59'; context.font = 'bold 31px Arial'; context.fillText('Lighthouse score history (0–100)', 36, 45);
  const series = [
    { key: 'performance' as const, label: 'Performance', color: '#2563eb' },
    { key: 'accessibility' as const, label: 'Accessibility', color: '#16a34a' },
    { key: 'bestPractices' as const, label: 'Best practices', color: '#9333ea' },
    { key: 'seo' as const, label: 'SEO', color: '#ea580c' },
  ];
  const left = 65, top = 90, plotW = 980, plotH = 250;
  [0, 25, 50, 75, 100].forEach((tick) => {
    const y = top + plotH - (tick / 100) * plotH;
    context.strokeStyle = '#e2e8f0'; context.setLineDash([5, 5]); context.beginPath(); context.moveTo(left, y); context.lineTo(left + plotW, y); context.stroke(); context.setLineDash([]);
    context.fillStyle = '#64748b'; context.font = '17px Arial'; context.fillText(String(tick), 25, y + 5);
  });
  series.forEach((item, seriesIndex) => {
    const points = scans.map((scan, index) => {
      const value = scan.speed?.[item.key] ?? null;
      return value == null ? null : { x: scans.length === 1 ? left + plotW / 2 : left + (index / (scans.length - 1)) * plotW, y: top + plotH - (value / 100) * plotH, value };
    }).filter((point): point is { x: number; y: number; value: number } => point !== null);
    context.strokeStyle = item.color; context.lineWidth = 4; context.beginPath();
    points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)); context.stroke();
    points.forEach((point) => { context.fillStyle = item.color; context.beginPath(); context.arc(point.x, point.y, 5, 0, Math.PI * 2); context.fill(); });
    const legendX = 55 + seriesIndex * 250; context.fillStyle = item.color; context.fillRect(legendX, 385, 20, 8); context.fillStyle = '#334155'; context.font = '18px Arial'; context.fillText(item.label, legendX + 28, 394);
  });
  const hasAnyScores = series.some((item) => scans.some((scan) => scan.speed?.[item.key] != null));
  if (!hasAnyScores) {
    context.fillStyle = '#92400e'; context.font = '20px Arial'; context.fillText('No successful Lighthouse scores are available in the saved scans for this website.', 65, 220);
  }
  const labelIndices = scans.length <= 5 ? scans.map((_, index) => index) : [0, Math.floor((scans.length - 1) / 2), scans.length - 1];
  labelIndices.forEach((index) => { const x = scans.length === 1 ? left + plotW / 2 : left + (index / (scans.length - 1)) * plotW; context.fillStyle = '#64748b'; context.font = '15px Arial'; context.textAlign = 'center'; context.fillText(new Date(scans[index].checkedAt).toLocaleDateString(), x, 365); }); context.textAlign = 'left';
  return canvas.toDataURL('image/png');
}

function drawMetricTrendPng(title: string, scans: ScanResult[], metric: 'lcpMs' | 'cls' | 'tbtMs', unit: string, divisor = 1, digits = 2, unavailableReason?: string) {
  const canvas = document.createElement('canvas'); canvas.width = 760; canvas.height = 330;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare the LCP, CLS, and Lighthouse diagnostic chart image.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#142b59'; context.font = 'bold 25px Arial'; context.fillText(title, 28, 38);
  context.fillStyle = '#64748b'; context.font = '16px Arial'; context.fillText(`Unit: ${unit} · lower is usually better`, 28, 65);
  const values = scans.map((scan) => { const raw = scan.speed?.[metric]; return raw == null ? null : raw / divisor; });
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) { context.fillStyle = '#92400e'; context.font = '17px Arial'; const note = context.measureText(unavailableReason || 'No successful values are available yet.').width > 680 ? (unavailableReason || '').slice(0, 82) + '…' : (unavailableReason || 'No successful values are available yet.'); context.fillText(note || 'No successful values are available yet.', 28, 150); return canvas.toDataURL('image/png'); }
  const min = Math.min(...valid); const max = Math.max(...valid); const range = max - min || Math.max(Math.abs(max) * 0.15, 0.01);
  const left = 48, top = 95, plotWidth = 675, plotHeight = 150;
  [0, 0.5, 1].forEach((fraction) => { const y = top + fraction * plotHeight; context.strokeStyle = '#e2e8f0'; context.setLineDash([5, 5]); context.beginPath(); context.moveTo(left, y); context.lineTo(left + plotWidth, y); context.stroke(); context.setLineDash([]); });
  const points = values.map((value, index) => value == null ? null : ({ value, index, x: scans.length === 1 ? left + plotWidth / 2 : left + (index / (scans.length - 1)) * plotWidth, y: top + (1 - ((value - min) / range)) * plotHeight })).filter((point): point is { value: number; index: number; x: number; y: number } => point !== null);
  context.strokeStyle = '#2563eb'; context.lineWidth = 4; context.beginPath(); points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)); context.stroke();
  points.forEach((point) => { context.fillStyle = '#2563eb'; context.beginPath(); context.arc(point.x, point.y, 5, 0, Math.PI * 2); context.fill(); context.fillStyle = '#334155'; context.font = '15px Arial'; context.fillText(point.value.toFixed(digits), point.x - 18, point.y - 11); });
  const labelIndexes = scans.length <= 5 ? scans.map((_, index) => index) : [0, Math.floor((scans.length - 1) / 2), scans.length - 1];
  labelIndexes.forEach((index) => { const x = scans.length === 1 ? left + plotWidth / 2 : left + (index / (scans.length - 1)) * plotWidth; context.fillStyle = '#64748b'; context.font = '13px Arial'; context.textAlign = 'center'; context.fillText(new Date(scans[index].checkedAt).toLocaleDateString(), x, top + plotHeight + 25); }); context.textAlign = 'left';
  return canvas.toDataURL('image/png');
}

async function exportPdf(current: ScanResult, previous: ScanResult | null, history: ScanResult[] = []) {
  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.autoTable;
  // Landscape gives issue descriptions, URLs and repair steps room to wrap instead of
  // forcing all columns into a narrow portrait page.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  const margin = 28;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const safe = (value: unknown) => printable(value);
  type PdfDocWithTable = typeof doc & { lastAutoTable?: { finalY: number } };
  const reportDoc = doc as PdfDocWithTable;
  const score = (value: number | null | undefined) => value == null ? 'Unavailable' : `${value}/100`;
  const findings = issueList(current);
  const activityEntries = uniqueActivities(current.activities);
  const chartScans = scansForWebsite(current, history);
  const lastSuccessfulAudit = [...chartScans].reverse().find((scan) => hasLighthouseData(scan.speed));
  const historicalScores = lastSuccessfulAudit
    ? `Performance ${score(lastSuccessfulAudit.speed?.performance)} · Accessibility ${score(lastSuccessfulAudit.speed?.accessibility)} · Best practices ${score(lastSuccessfulAudit.speed?.bestPractices)} · SEO ${score(lastSuccessfulAudit.speed?.seo)}`
    : 'No successful Lighthouse audit is saved for this website.';
  const lastSuccessfulAuditLabel = !lastSuccessfulAudit
    ? 'None saved'
    : lastSuccessfulAudit.id === current.id
      ? 'This scan'
      : new Date(lastSuccessfulAudit.checkedAt).toLocaleString();
  const scoreColor = (value: number | null | undefined): [number, number, number] => {
    if (value == null) return [100, 116, 139];
    if (value >= 90) return [22, 101, 52];
    if (value >= 70) return [146, 64, 14];
    return [185, 28, 28];
  };

  // Branded report header.
  doc.setFillColor(20, 43, 89);
  doc.rect(0, 0, pageWidth, 104, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(255, 255, 255);
  doc.text('WEBSITE MONITOR AI', margin, 34);
  doc.setFontSize(13);
  doc.setTextColor(220, 232, 250);
  doc.text('Website Audit Report', margin, 55);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(safe(current.siteUrl), usableWidth - 20), margin, 75);
  doc.setTextColor(220, 232, 250);
  doc.text(`Scan time: ${safe(new Date(current.checkedAt).toLocaleString())}`, margin, 91);
  doc.text(`Generated: ${safe(new Date().toLocaleString())}`, pageWidth - margin, 91, { align: 'right' });

  // Four score cards use clear contrast and consistent dimensions.
  const cards = [
    ['Performance', current.speed?.performance],
    ['Accessibility', current.speed?.accessibility],
    ['Best practices', current.speed?.bestPractices],
    ['SEO', current.speed?.seo],
  ] as const;
  const cardGap = 10;
  const cardWidth = (usableWidth - cardGap * 3) / 4;
  const cardY = 119;
  const cardHeight = 57;
  cards.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + cardGap);
    const tint = value == null ? [241, 245, 249] : value >= 90 ? [240, 253, 244] : value >= 70 ? [255, 251, 235] : [254, 242, 242];
    doc.setFillColor(tint[0], tint[1], tint[2]);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 7, 7, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(label, x + 11, cardY + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    const color = scoreColor(value);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(score(value), x + 11, cardY + 42);
  });

  let cursorY = 195;
  if (current.speed?.error) {
    const notice = `PageSpeed audit unavailable: ${explainPageSpeedError(current.speed.error)}`;
    doc.setFillColor(255, 247, 237); doc.setDrawColor(253, 186, 116);
    const lines = doc.splitTextToSize(notice, usableWidth - 20);
    const noticeHeight = Math.max(28, lines.length * 9 + 12);
    doc.roundedRect(margin, 184, usableWidth, noticeHeight, 6, 6, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(124, 45, 18);
    doc.text(lines.slice(0, 4), margin + 10, 197);
    cursorY = 184 + noticeHeight + 14;
  }
  const addSectionHeading = (heading: string) => {
    if (cursorY > pageHeight - 100) {
      doc.addPage('a4', 'landscape');
      cursorY = margin + 8;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 43, 89);
    doc.text(heading, margin, cursorY);
    cursorY += 9;
  };
  const addTable = (
    heading: string,
    head: string[],
    rows: unknown[][],
    widths?: number[],
    fontSize = 7.5,
  ) => {
    addSectionHeading(heading);
    autoTable(doc, {
      startY: cursorY,
      head: [head.map(safe)],
      body: rows.length ? rows.map((row) => row.map(safe)) : [[`No ${heading.toLowerCase()} recorded`]],
      margin: { left: margin, right: margin, top: margin, bottom: 30 },
      tableWidth: usableWidth,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize,
        cellPadding: 4,
        overflow: 'linebreak',
        textColor: [51, 65, 85],
        valign: 'top',
        lineColor: [226, 232, 240],
        lineWidth: 0.35,
      },
      headStyles: { fillColor: [31, 64, 124], textColor: [255, 255, 255], fontStyle: 'bold', valign: 'middle' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: widths ? Object.fromEntries(widths.map((cellWidth, index) => [index, { cellWidth }])) : undefined,
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
    });
    cursorY = (reportDoc.lastAutoTable?.finalY ?? cursorY) + 20;
  };

  const metrics: unknown[][] = [
    ['Overall status', safe(current.overallStatus.toUpperCase()), 'HTTP response', `HTTP ${current.uptime?.status ?? 'Unavailable'} · ${current.uptime?.responseMs ?? 'Unavailable'} ms`],
    ['URL requests checked', current.linksChecked ?? 0, 'HTML pages inspected', current.pagesChecked ?? 0],
    ['Broken links / request errors', current.linkIssues?.length ?? 0, 'Redirect hops observed', current.redirects?.length ?? 0],
    ['Configured URL limit', current.crawlConfig?.limit ?? 'Not recorded', 'Sitemap scan', current.crawlConfig ? (current.crawlConfig.sitemapEnabled ? 'Enabled' : 'Disabled') : 'Not recorded'],
    ['Sitemap URLs discovered', current.crawlConfig?.sitemapUrlsDiscovered ?? 'Not recorded', 'Detailed findings', findings.length],
    ['LCP', current.speed?.lcpMs == null ? 'Unavailable' : `${(current.speed.lcpMs / 1000).toFixed(2)} s`, 'CLS', current.speed?.cls == null ? 'Unavailable' : current.speed.cls.toFixed(3)],
    ['TBT', current.speed?.tbtMs == null ? 'Unavailable' : `${Math.round(current.speed.tbtMs)} ms`, 'Report warnings', current.warnings?.length ?? 0],
    ['PageSpeed audit', current.speed?.error ? 'Unavailable' : hasLighthouseData(current.speed) ? 'Completed' : 'No usable data', 'Reason / status', current.speed?.error ? explainPageSpeedError(current.speed.error) : 'Lighthouse response checked'],
    ['Last successful Lighthouse audit', lastSuccessfulAuditLabel, 'Last successful scores (historical)', historicalScores],
  ];
  addTable('Scan overview', ['Metric', 'Result', 'Metric', 'Result'], metrics, [145, 248, 145, usableWidth - 538], 8);

  // A dedicated landscape analytics page keeps the visuals wide and avoids compressing long tables.
  doc.addPage('a4', 'landscape');
  cursorY = 48;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(20, 43, 89); doc.text('Visual analytics', margin, cursorY);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text('Graphs are based on this scan and saved scans for the same website only.', margin, cursorY + 14);
  const panelGap = 26; const panelWidth = (usableWidth - panelGap) / 2; const panelTop = 86;
  const drawHorizontalPanel = (title: string, x: number, y: number, rows: Array<{ label: string; value: number | null; color: [number, number, number] }>, maxValue: number) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(31, 64, 124); doc.text(title, x, y);
    rows.forEach((row, index) => {
      const rowY = y + 24 + index * 30;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(51, 65, 85); doc.text(row.label.slice(0, 30), x, rowY + 9);
      const barX = x + 112; const barW = Math.max(80, panelWidth - 162); const barY = rowY;
      doc.setFillColor(241, 245, 249); doc.roundedRect(barX, barY, barW, 11, 3, 3, 'F');
      if (row.value != null) { doc.setFillColor(...row.color); doc.roundedRect(barX, barY, Math.max(0, Math.min(barW, row.value / Math.max(1, maxValue) * barW)), 11, 3, 3, 'F'); }
      doc.setFont('helvetica', 'bold'); doc.setTextColor(51, 65, 85); doc.text(row.value == null ? 'Unavailable' : String(Number(row.value.toFixed(2))), barX + barW + 6, rowY + 9);
    });
  };
  drawHorizontalPanel('Current Lighthouse scores (out of 100)', margin, panelTop, [
    { label: 'Performance', value: current.speed?.performance ?? null, color: [37, 99, 235] },
    { label: 'Accessibility', value: current.speed?.accessibility ?? null, color: [22, 163, 74] },
    { label: 'Best practices', value: current.speed?.bestPractices ?? null, color: [147, 51, 234] },
    { label: 'SEO', value: current.speed?.seo ?? null, color: [234, 88, 12] },
  ], 100);
  const categories = [
    { label: 'Availability', key: 'availability', color: [220, 38, 38] as [number, number, number] },
    { label: 'Links', key: 'links', color: [234, 88, 12] as [number, number, number] },
    { label: 'SEO', key: 'seo', color: [124, 58, 237] as [number, number, number] },
    { label: 'Performance', key: 'performance', color: [37, 99, 235] as [number, number, number] },
    { label: 'Accessibility', key: 'accessibility', color: [5, 150, 105] as [number, number, number] },
    { label: 'Best practices', key: 'best-practices', color: [8, 145, 178] as [number, number, number] },
  ];
  const categoryRows = categories.map((category) => ({ label: category.label, value: findings.filter((item) => item.category === category.key).length, color: category.color }));
  drawHorizontalPanel('Findings by category', margin + panelWidth + panelGap, panelTop, categoryRows, Math.max(1, ...categoryRows.map((row) => row.value)));
  const severityRows = [
    { label: 'Critical', value: findings.filter((item) => item.severity === 'critical').length, color: [153, 27, 27] as [number, number, number] },
    { label: 'High', value: findings.filter((item) => item.severity === 'high').length, color: [220, 38, 38] as [number, number, number] },
    { label: 'Medium', value: findings.filter((item) => item.severity === 'medium').length, color: [217, 119, 6] as [number, number, number] },
    { label: 'Low', value: findings.filter((item) => item.severity === 'low').length, color: [5, 150, 105] as [number, number, number] },
  ];
  drawHorizontalPanel('Findings by severity', margin, 250, severityRows, Math.max(1, ...severityRows.map((row) => row.value)));
  const trendTop = 425; const trendHeight = 70; const trendWidth = usableWidth - 60; const trendX = margin + 30; const baselineY = trendTop + trendHeight;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(31, 64, 124); doc.text('Lighthouse score trends', margin, trendTop - 10);
  doc.setDrawColor(226, 232, 240); doc.line(trendX, trendTop, trendX + trendWidth, trendTop); doc.line(trendX, baselineY, trendX + trendWidth, baselineY);
  const chartSeries = [
    { key: 'performance' as const, label: 'Performance', color: [37, 99, 235] as [number, number, number] },
    { key: 'accessibility' as const, label: 'Accessibility', color: [22, 163, 74] as [number, number, number] },
    { key: 'bestPractices' as const, label: 'Best practices', color: [147, 51, 234] as [number, number, number] },
    { key: 'seo' as const, label: 'SEO', color: [234, 88, 12] as [number, number, number] },
  ];
  chartSeries.forEach((series, seriesIndex) => {
    let lastPoint: { x: number; y: number } | null = null;
    chartScans.forEach((item, index) => {
      const value = item.speed?.[series.key] ?? null;
      if (value == null) { lastPoint = null; return; }
      const x = chartScans.length === 1 ? trendX + trendWidth / 2 : trendX + (index / (chartScans.length - 1)) * trendWidth;
      const y = baselineY - (value / 100) * trendHeight;
      if (lastPoint) { doc.setDrawColor(...series.color); doc.setLineWidth(1.6); doc.line(lastPoint.x, lastPoint.y, x, y); }
      doc.setFillColor(...series.color); doc.circle(x, y, 2.4, 'F'); lastPoint = { x, y };
      if (seriesIndex === 0 && (index === 0 || index === chartScans.length - 1 || chartScans.length <= 4)) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(71, 85, 105); doc.text(new Date(item.checkedAt).toLocaleDateString(), x, baselineY + 11, { align: 'center' }); }
    });
    const legendX = margin + seriesIndex * 165; doc.setFillColor(...series.color); doc.rect(legendX, pageHeight - 69, 9, 5, 'F'); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(51, 65, 85); doc.text(series.label, legendX + 13, pageHeight - 64);
  });

  // Keep LCP, CLS, and the separate Lighthouse TBT diagnostic in their original units.
  doc.addPage('a4', 'landscape');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(20, 43, 89); doc.text('LCP, CLS & Lighthouse diagnostics — historical trends', margin, 48);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text('Each metric has its own scale. These are Lighthouse lab measurements; compare similar scans.', margin, 62);
  const metricPanelGap = 14; const metricPanelWidth = (usableWidth - metricPanelGap * 2) / 3;
  const metricPanels = [
    { key: 'lcpMs' as const, title: 'LCP · seconds', unit: 's', color: [37, 99, 235] as [number, number, number], values: chartScans.map((item) => item.speed?.lcpMs == null ? null : item.speed.lcpMs / 1000), digits: 2 },
    { key: 'cls' as const, title: 'CLS · score', unit: 'score', color: [147, 51, 234] as [number, number, number], values: chartScans.map((item) => item.speed?.cls ?? null), digits: 3 },
    { key: 'tbtMs' as const, title: 'TBT · milliseconds', unit: 'ms', color: [234, 88, 12] as [number, number, number], values: chartScans.map((item) => item.speed?.tbtMs ?? null), digits: 0 },
  ];
  metricPanels.forEach((panel, panelIndex) => {
    const x = margin + panelIndex * (metricPanelWidth + metricPanelGap);
    doc.setDrawColor(226, 232, 240); doc.setFillColor(255, 255, 255); doc.roundedRect(x, 92, metricPanelWidth, 390, 7, 7, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(31, 64, 124); doc.text(panel.title, x + 12, 112);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139); doc.text('Lower is usually better', x + 12, 126);
    const valid = panel.values.filter((value): value is number => value !== null && Number.isFinite(value));
    if (!valid.length) {
      doc.setFontSize(8.5);
      const note = current.speed?.error ? explainPageSpeedError(current.speed.error) : 'No successful values are available in the saved scans for this website.';
      doc.text(doc.splitTextToSize(note, metricPanelWidth - 24).slice(0, 5), x + 12, 165);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(124, 45, 18); doc.text('Current scan: Unavailable', x + 12, 455);
      return;
    }
    const min = Math.min(...valid); const max = Math.max(...valid); const range = max - min || Math.max(Math.abs(max) * 0.15, 0.01);
    const plotX = x + 15, plotY = 150, plotW = metricPanelWidth - 30, plotH = 245;
    [0, .5, 1].forEach((fraction) => { const y = plotY + fraction * plotH; doc.setDrawColor(226, 232, 240); doc.setLineDashPattern([2, 2], 0); doc.line(plotX, y, plotX + plotW, y); });
    doc.setLineDashPattern([], 0);
    const points = panel.values.map((value, index) => value == null ? null : ({ index, value, x: chartScans.length === 1 ? plotX + plotW / 2 : plotX + (index / (chartScans.length - 1)) * plotW, y: plotY + (1 - ((value - min) / range)) * plotH })).filter((point): point is { index: number; value: number; x: number; y: number } => point !== null);
    doc.setDrawColor(...panel.color); doc.setLineWidth(1.7);
    points.forEach((point, index) => { if (index > 0) doc.line(points[index - 1].x, points[index - 1].y, point.x, point.y); doc.setFillColor(...panel.color); doc.circle(point.x, point.y, 2.5, 'F'); });
    const firstPoint = points[0]; const lastPoint = points[points.length - 1];
    if (firstPoint) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(51, 65, 85); doc.text(firstPoint.value.toFixed(panel.digits), firstPoint.x, firstPoint.y - 8, { align: 'center' }); }
    if (lastPoint && lastPoint !== firstPoint) { doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(51, 65, 85); doc.text(lastPoint.value.toFixed(panel.digits), lastPoint.x, lastPoint.y - 8, { align: 'center' }); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    if (chartScans.length) {
      doc.text(new Date(chartScans[0].checkedAt).toLocaleDateString(), plotX, plotY + plotH + 18);
      if (chartScans.length > 2) doc.text(new Date(chartScans[Math.floor((chartScans.length - 1) / 2)].checkedAt).toLocaleDateString(), plotX + plotW / 2, plotY + plotH + 18, { align: 'center' });
      if (chartScans.length > 1) doc.text(new Date(chartScans[chartScans.length - 1].checkedAt).toLocaleDateString(), plotX + plotW, plotY + plotH + 18, { align: 'right' });
    }
    const currentRaw = current.speed?.[panel.key];
    const currentValue = currentRaw == null ? null : panel.key === 'lcpMs' ? currentRaw / 1000 : currentRaw;
    const lastPointScan = lastPoint ? chartScans[lastPoint.index] : null;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(currentValue == null ? 124 : 31, currentValue == null ? 45 : 64, currentValue == null ? 18 : 124);
    doc.text(`Current scan: ${currentValue == null ? 'Unavailable' : `${currentValue.toFixed(panel.digits)} ${panel.unit}`}`, x + 12, 440);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
    if (currentValue == null && lastPoint && lastPointScan) {
      doc.text(`Last successful: ${lastPoint.value.toFixed(panel.digits)} ${panel.unit} · ${new Date(lastPointScan.checkedAt).toLocaleDateString()}`, x + 12, 455);
    } else if (currentValue != null) {
      doc.text('Measured in this scan', x + 12, 455);
    }
  });
  cursorY = pageHeight - 45;

  // Keep the index compact and searchable on paper. Long explanations go in their own
  // wide 4-column table so text remains readable on landscape pages.
  addTable('Findings index', ['Severity', 'Category', 'Issue', 'Affected URL'], findings.map((item) => [item.severity.toUpperCase(), item.category, item.title, item.url || current.siteUrl]), [72, 115, 245, usableWidth - 432], 7.4);
  addTable('Finding details and recommended actions', ['Finding', 'What was found', 'Why it matters', 'Recommended fix'], findings.map((item) => [`${item.severity.toUpperCase()} · ${item.category}\n${item.title}\nURL: ${item.url || current.siteUrl}`, item.what, item.impact, item.recommendation]), [190, 190, 175, usableWidth - 555], 7.2);

  const cmsGuidanceRows = findings.map((item) => [
    `${item.severity.toUpperCase()} · ${item.category}: ${item.title}`,
    getCmsGuidance(item).join('\n'),
  ]);
  addTable('WordPress / Elementor repair guidance', ['Issue', 'Practical CMS steps'], cmsGuidanceRows, [250, usableWidth - 250], 7.3);
  addTable('SEO page review', ['Page URL', 'HTTP', 'Title', 'Meta description', 'H1', 'Findings'], (current.seoPages ?? []).map((page) => [page.url, page.status, `${page.title || 'Missing'} (${page.titleLength} chars)`, `${page.description || 'Missing'} (${(page.description ?? '').length} chars)`, `${page.h1Count}: ${(page.h1Texts ?? []).join(' | ') || 'None'}`, (page.issues ?? []).join('; ') || 'None']), [190, 48, 135, 175, 110, usableWidth - 658], 7.0);
  addTable('Redirect chain', ['HTTP status', 'Source URL', 'Destination URL'], (current.redirects ?? []).map((redirect) => [redirect.status, redirect.from, redirect.to]), [75, (usableWidth - 75) / 2, (usableWidth - 75) / 2], 7.4);
  addTable('Request errors', ['HTTP status', 'Affected URL', 'Details'], (current.linkIssues ?? []).map((issue) => [issue.status ?? 'No response', issue.url, issue.message]), [85, 300, usableWidth - 385], 7.4);

  if (previous && sameSite(current.siteUrl, previous.siteUrl)) {
    const currKeys = new Set(findings.map(normalizedIssueKey));
    const prevKeys = new Set(issueList(previous).map(normalizedIssueKey));
    const newer = findings.filter((issue) => !prevKeys.has(normalizedIssueKey(issue)));
    const noLonger = issueList(previous).filter((issue) => !currKeys.has(normalizedIssueKey(issue)));
    addTable('Comparison with previous scan', ['Metric / comparison', 'Previous scan', 'Current scan', 'Change'], [
      ['Scan time', new Date(previous.checkedAt).toLocaleString(), new Date(current.checkedAt).toLocaleString(), ''],
      ['Finding count', issueList(previous).length, findings.length, deltaText(findings.length, issueList(previous).length)],
      ...(['performance', 'accessibility', 'bestPractices', 'seo'] as const).map((key) => [scoreName(key), score(metricValue(previous, key)), score(metricValue(current, key)), deltaText(metricValue(current, key), metricValue(previous, key))]),
      ['LCP', previous.speed?.lcpMs == null ? 'Unavailable' : `${(previous.speed.lcpMs / 1000).toFixed(2)} s`, current.speed?.lcpMs == null ? 'Unavailable' : `${(current.speed.lcpMs / 1000).toFixed(2)} s`, deltaText(current.speed?.lcpMs == null ? null : current.speed.lcpMs / 1000, previous.speed?.lcpMs == null ? null : previous.speed.lcpMs / 1000, 2, ' s')],
      ['CLS', previous.speed?.cls ?? 'Unavailable', current.speed?.cls ?? 'Unavailable', deltaText(current.speed?.cls, previous.speed?.cls, 3)],
      ['TBT', previous.speed?.tbtMs == null ? 'Unavailable' : `${Math.round(previous.speed.tbtMs)} ms`, current.speed?.tbtMs == null ? 'Unavailable' : `${Math.round(current.speed.tbtMs)} ms`, deltaText(current.speed?.tbtMs, previous.speed?.tbtMs, 0, ' ms')],
      ['New / changed findings', newer.map((issue) => issue.title).join('; ') || 'None detected', '', `${newer.length} finding(s)`],
      ['No longer detected', noLonger.map((issue) => issue.title).join('; ') || 'None detected', '', `${noLonger.length} finding(s)`],
    ], [200, 190, 190, usableWidth - 580], 7.6);
  }
  addTable('AI summary, recommendations and warnings', ['Type', 'Details'], [
    ['AI summary', current.aiSummary || 'No AI summary saved.'],
    ...(current.recommendations ?? []).map((item, index) => [`Recommendation ${index + 1}`, item]),
    ...(current.warnings ?? []).map((item) => ['Monitoring warning', item]),
  ], [190, usableWidth - 190], 7.5);
  addTable('Timestamped scan activity', ['Time', 'Step', 'Level', 'Detail', 'Duration'], activityEntries.map((activity) => [new Date(activity.timestamp).toLocaleTimeString(), activity.step, activity.level, activity.message, activity.durationMs == null ? '' : `${activity.durationMs} ms`]), [75, 125, 65, usableWidth - 325, 60], 6.8);

  // Consistent footer and page numbers on every page, including pages auto-added by tables.
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Website Monitor AI · Read-only monitoring report', margin, pageHeight - 12);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 12, { align: 'right' });
  }
  const date = current.checkedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  doc.save(`${safeFilePart(current.siteUrl)}-audit-report-${date}.pdf`);
}

async function exportExcel(current: ScanResult, previous: ScanResult | null, history: ScanResult[] = []) {
  // ExcelJS creates a real multi-sheet XLSX workbook with styles, filters, frozen headers,
  // readable column widths and wrapped text (unlike a single flat CSV file).
  const module = await import('exceljs');
  const ExcelJS = module.default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Website Monitor AI';
  workbook.subject = 'Website audit report';
  workbook.title = `Website audit report - ${current.siteUrl}`;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.company = 'Website Monitor AI';
  workbook.description = 'Read-only website monitoring report with findings, SEO, redirects and scan activity.';
  const navy = 'FF142B59';
  const blue = 'FF1F407C';
  const paleBlue = 'FFF1F5F9';
  const line = 'FFE2E8F0';
  const text = 'FF334155';
  const green = 'FF166534';
  const amber = 'FF92400E';
  const red = 'FFB91C1C';
  const findings = issueList(current);
  const activityEntries = uniqueActivities(current.activities);
  const currentKeys = new Set(findings.map(normalizedIssueKey));
  const previousKeys = new Set(previous && sameSite(current.siteUrl, previous.siteUrl) ? issueList(previous).map(normalizedIssueKey) : []);
  const newFindings = findings.filter((item) => !previousKeys.has(normalizedIssueKey(item)));
  const noLongerFindings = previous && sameSite(current.siteUrl, previous.siteUrl)
    ? issueList(previous).filter((item) => !currentKeys.has(normalizedIssueKey(item)))
    : [];
  const date = current.checkedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const analyticsScans = scansForWebsite(current, history);
  const lastSuccessfulAudit = [...analyticsScans].reverse().find((scan) => hasLighthouseData(scan.speed));
  const historicalScores = lastSuccessfulAudit
    ? `Performance ${lastSuccessfulAudit.speed?.performance == null ? 'Unavailable' : `${lastSuccessfulAudit.speed.performance}/100`} · Accessibility ${lastSuccessfulAudit.speed?.accessibility == null ? 'Unavailable' : `${lastSuccessfulAudit.speed.accessibility}/100`} · Best practices ${lastSuccessfulAudit.speed?.bestPractices == null ? 'Unavailable' : `${lastSuccessfulAudit.speed.bestPractices}/100`} · SEO ${lastSuccessfulAudit.speed?.seo == null ? 'Unavailable' : `${lastSuccessfulAudit.speed.seo}/100`}`
    : 'No successful Lighthouse audit is saved for this website.';
  const lastSuccessfulAuditLabel = !lastSuccessfulAudit
    ? 'None saved'
    : lastSuccessfulAudit.id === current.id
      ? 'This scan'
      : new Date(lastSuccessfulAudit.checkedAt).toLocaleString();

  function styleHeaderCell(cell: any, fill = blue) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: line } } };
  }
  function addDataSheet(
    sheetName: string,
    title: string,
    subtitle: string,
    headers: string[],
    rows: unknown[][],
    widths: number[],
    opts: { severityColumn?: number; categoryColumn?: number; recordTypeColumn?: number } = {},
  ) {
    const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    sheet.properties.defaultRowHeight = 30;
    sheet.properties.tabColor = { argb: blue };
    sheet.columns = headers.map((header, index) => ({ header, key: `c${index + 1}`, width: widths[index] ?? 22 }));
    sheet.mergeCells(1, 1, 1, headers.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
    titleCell.font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 34;
    sheet.mergeCells(2, 1, 2, headers.length);
    const subtitleCell = sheet.getCell(2, 1);
    subtitleCell.value = subtitle;
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: paleBlue } };
    subtitleCell.font = { name: 'Aptos', size: 10, color: { argb: text }, italic: true };
    subtitleCell.alignment = { vertical: 'middle', wrapText: true };
    sheet.getRow(2).height = 26;
    sheet.getRow(3).height = 8;
    const headerRow = sheet.getRow(4);
    headers.forEach((header, index) => {
      headerRow.getCell(index + 1).value = header;
      styleHeaderCell(headerRow.getCell(index + 1));
    });
    headerRow.height = 32;
    rows.forEach((values, index) => {
      const row = sheet.getRow(index + 5);
      headers.forEach((_, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        const value = values[colIndex];
        cell.value = value == null ? '' : value instanceof Date ? value : typeof value === 'number' ? value : String(value);
        cell.font = { name: 'Aptos', size: 10, color: { argb: text } };
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        cell.border = { bottom: { style: 'hair', color: { argb: line } } };
        if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
      if (opts.severityColumn != null) {
        const severityCell = row.getCell(opts.severityColumn + 1);
        const severity = String(values[opts.severityColumn] ?? '').toLowerCase();
        if (severity.includes('critical') || severity.includes('high') || severity.includes('error')) {
          severityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          severityCell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: red } };
        } else if (severity.includes('medium') || severity.includes('warning')) {
          severityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          severityCell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: amber } };
        } else if (severity.includes('low') || severity.includes('success')) {
          severityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          severityCell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: green } };
        }
      }
      if (opts.categoryColumn != null) {
        const categoryCell = row.getCell(opts.categoryColumn + 1);
        categoryCell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: blue } };
      }
      if (opts.recordTypeColumn != null) {
        const typeCell = row.getCell(opts.recordTypeColumn + 1);
        typeCell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: blue } };
      }
      // Avoid creating extremely tall rows because URLs and recommendations can be long.
      row.height = Math.max(28, Math.min(90, 15 * Math.max(1, ...values.map((value, colIndex) => {
        const width = widths[colIndex] ?? 22;
        const chars = String(value ?? '').length;
        return Math.ceil(chars / Math.max(10, width * 1.05));
      }))));
    });
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, rows.length + 4), column: headers.length } };
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    sheet.headerFooter.oddFooter = '&LWebsite Monitor AI&CPage &P of &N&RInternal audit report';
    return sheet;
  }

  // Overview: paired metrics make the workbook immediately understandable on opening.
  const scoreCounts = {
    critical: findings.filter((item) => item.severity === 'critical').length,
    high: findings.filter((item) => item.severity === 'high').length,
    medium: findings.filter((item) => item.severity === 'medium').length,
    low: findings.filter((item) => item.severity === 'low').length,
  };
  const overviewRows: unknown[][] = [
    ['Website', current.siteUrl, 'Scan date', new Date(current.checkedAt).toLocaleString()],
    ['Overall status', current.overallStatus.toUpperCase(), 'Homepage HTTP', `HTTP ${current.uptime?.status ?? 'Unavailable'}`],
    ['Response time (ms)', current.uptime?.responseMs ?? 'Unavailable', 'Scan duration (seconds)', activityEntries.length ? Math.round((new Date(activityEntries[activityEntries.length - 1].timestamp).getTime() - new Date(activityEntries[0].timestamp).getTime()) / 1000) : 'Unavailable'],
    ['URL request limit', current.crawlConfig?.limit ?? 'Not recorded', 'URLs checked', current.linksChecked ?? 0],
    ['HTML pages inspected', current.pagesChecked ?? 0, 'Redirect hops', current.redirects?.length ?? 0],
    ['Broken links/request errors', current.linkIssues?.length ?? 0, 'Total detailed findings', findings.length],
    ['Critical findings', scoreCounts.critical, 'High findings', scoreCounts.high],
    ['Medium findings', scoreCounts.medium, 'Low findings', scoreCounts.low],
    ['Performance score', current.speed?.performance == null ? 'Unavailable' : `${current.speed.performance}/100`, 'Accessibility score', current.speed?.accessibility == null ? 'Unavailable' : `${current.speed.accessibility}/100`],
    ['Best practices score', current.speed?.bestPractices == null ? 'Unavailable' : `${current.speed.bestPractices}/100`, 'SEO score', current.speed?.seo == null ? 'Unavailable' : `${current.speed.seo}/100`],
    ['LCP', current.speed?.lcpMs == null ? 'Unavailable' : `${(current.speed.lcpMs / 1000).toFixed(2)} seconds`, 'CLS', current.speed?.cls == null ? 'Unavailable' : current.speed.cls.toFixed(3)],
    ['TBT', current.speed?.tbtMs == null ? 'Unavailable' : `${Math.round(current.speed.tbtMs)} ms`, 'Sitemap scan', current.crawlConfig?.sitemapEnabled ? 'Enabled' : current.crawlConfig ? 'Disabled' : 'Not recorded'],
    ['PageSpeed audit', current.speed?.error ? 'Unavailable' : hasLighthouseData(current.speed) ? 'Completed' : 'No usable data', 'Reason / status', current.speed?.error ? explainPageSpeedError(current.speed.error) : 'Lighthouse response checked'],
    ['Last successful Lighthouse audit', lastSuccessfulAuditLabel, 'Last successful scores (historical)', historicalScores],
    ['Sitemap URLs discovered', current.crawlConfig?.sitemapUrlsDiscovered ?? 'Not recorded', 'Sitemap sources', (current.crawlConfig?.sitemapSources ?? []).join('; ') || 'None recorded'],
    ['Previous scan', previous && sameSite(current.siteUrl, previous.siteUrl) ? new Date(previous.checkedAt).toLocaleString() : 'No previous scan', 'Change in findings', previous && sameSite(current.siteUrl, previous.siteUrl) ? findings.length - issueList(previous).length : 'Unavailable'],
    ['New findings vs previous', previous && sameSite(current.siteUrl, previous.siteUrl) ? newFindings.length : 'Unavailable', 'No longer detected', previous && sameSite(current.siteUrl, previous.siteUrl) ? noLongerFindings.length : 'Unavailable'],
  ];
  const analytics = workbook.addWorksheet('Analytics', { views: [{ showGridLines: false }] });
  analytics.properties.tabColor = { argb: 'FF2563EB' };
  analytics.columns = Array.from({ length: 16 }, () => ({ width: 12 }));
  analytics.mergeCells('A1:P1');
  analytics.getCell('A1').value = 'WEBSITE MONITOR AI — ANALYTICS DASHBOARD';
  analytics.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
  analytics.getCell('A1').font = { name: 'Aptos Display', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  analytics.getCell('A1').alignment = { vertical: 'middle' }; analytics.getRow(1).height = 42;
  analytics.mergeCells('A2:P2'); analytics.getCell('A2').value = `${current.siteUrl} · ${new Date(current.checkedAt).toLocaleString()} · Current values and saved history for this website`;
  analytics.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: paleBlue } }; analytics.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: text }, italic: true }; analytics.getCell('A2').alignment = { wrapText: true }; analytics.getRow(2).height = 28;
  const scoreChart = drawBarChartPng('Current Lighthouse scores', ['Performance', 'Accessibility', 'Best practices', 'SEO'], [current.speed?.performance ?? null, current.speed?.accessibility ?? null, current.speed?.bestPractices ?? null, current.speed?.seo ?? null], ['#2563eb', '#16a34a', '#9333ea', '#ea580c'], 100);
  const categoryKeys = ['availability', 'links', 'seo', 'performance', 'accessibility', 'best-practices'];
  const categoryLabels = ['Availability', 'Links', 'SEO', 'Performance', 'Accessibility', 'Best practices'];
  const categoryValues = categoryKeys.map((key) => findings.filter((item) => item.category === key).length);
  const categoryChart = drawBarChartPng('Detailed findings by category', categoryLabels, categoryValues, ['#dc2626', '#ea580c', '#7c3aed', '#2563eb', '#059669', '#0891b2']);
  const severityLabels = ['Critical', 'High', 'Medium', 'Low'];
  const severityValues = [scoreCounts.critical, scoreCounts.high, scoreCounts.medium, scoreCounts.low];
  const severityChart = drawBarChartPng('Findings by severity', severityLabels, severityValues, ['#991b1b', '#dc2626', '#d97706', '#059669']);
  const trendChart = drawScoreTrendPng(analyticsScans);
  const scoreImageId = workbook.addImage({ base64: scoreChart, extension: 'png' });
  const categoryImageId = workbook.addImage({ base64: categoryChart, extension: 'png' });
  const severityImageId = workbook.addImage({ base64: severityChart, extension: 'png' });
  const trendImageId = workbook.addImage({ base64: trendChart, extension: 'png' });
  analytics.addImage(scoreImageId, 'A4:H20'); analytics.addImage(categoryImageId, 'I4:P22'); analytics.addImage(severityImageId, 'A22:H36'); analytics.addImage(trendImageId, 'I23:P43');
  analytics.mergeCells('A45:P45'); analytics.getCell('A45').value = 'LCP, CLS, and the Lighthouse TBT diagnostic charts are available on the Web Vitals & TBT sheet. Numeric values are listed in Score History.';
  analytics.getCell('A45').font = { name: 'Aptos', size: 11, bold: true, color: { argb: blue } };
  analytics.getCell('A45').alignment = { vertical: 'middle' }; analytics.getRow(45).height = 26;
  analytics.views = [{ showGridLines: false }];
  analytics.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  const webVitals = workbook.addWorksheet('Web Vitals & TBT', { views: [{ showGridLines: false }] });
  webVitals.properties.tabColor = { argb: 'FF0891B2' };
  webVitals.columns = Array.from({ length: 18 }, () => ({ width: 12 }));
  webVitals.mergeCells('A1:R1'); webVitals.getCell('A1').value = 'CORE WEB VITALS — HISTORICAL TRENDS';
  webVitals.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }; webVitals.getCell('A1').font = { name: 'Aptos Display', size: 20, bold: true, color: { argb: 'FFFFFFFF' } }; webVitals.getRow(1).height = 42;
  webVitals.mergeCells('A2:R2'); webVitals.getCell('A2').value = `${current.siteUrl} · Separate charts use separate units; lower values are generally better.`; webVitals.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: paleBlue } }; webVitals.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: text }, italic: true }; webVitals.getRow(2).height = 28;
  const lcpChartId = workbook.addImage({ base64: drawMetricTrendPng('Largest Contentful Paint (seconds)', analyticsScans, 'lcpMs', 's', 1000, 2, current.speed?.error ? explainPageSpeedError(current.speed.error) : undefined), extension: 'png' });
  const clsChartId = workbook.addImage({ base64: drawMetricTrendPng('Cumulative Layout Shift (score)', analyticsScans, 'cls', 'score', 1, 3, current.speed?.error ? explainPageSpeedError(current.speed.error) : undefined), extension: 'png' });
  const tbtChartId = workbook.addImage({ base64: drawMetricTrendPng('Total Blocking Time (TBT · Lighthouse diagnostic)', analyticsScans, 'tbtMs', 'ms', 1, 0, current.speed?.error ? explainPageSpeedError(current.speed.error) : undefined), extension: 'png' });
  webVitals.addImage(lcpChartId, 'A4:F20'); webVitals.addImage(clsChartId, 'G4:L20'); webVitals.addImage(tbtChartId, 'M4:R20');
  webVitals.mergeCells('A22:R22'); webVitals.getCell('A22').value = 'Exact values, scan timestamps, URL coverage and issue counts are in the Score History sheet.'; webVitals.getCell('A22').font = { name: 'Aptos', size: 11, bold: true, color: { argb: blue } }; webVitals.getRow(22).height = 27;
  webVitals.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  addDataSheet('Score History', 'SCORE HISTORY AND SCAN COVERAGE', `${analyticsScans.length} scan(s) from the same website. Use this sheet to inspect the chart values and crawl coverage.`, ['Scan Time', 'Website URL', 'Performance', 'Accessibility', 'Best Practices', 'SEO', 'LCP (s)', 'CLS', 'TBT (ms)', 'HTML Pages', 'URLs Checked', 'Detailed Findings', 'HTTP Status', 'Response (ms)'], analyticsScans.map((item) => [new Date(item.checkedAt).toLocaleString(), item.siteUrl, item.speed?.performance ?? 'Unavailable', item.speed?.accessibility ?? 'Unavailable', item.speed?.bestPractices ?? 'Unavailable', item.speed?.seo ?? 'Unavailable', item.speed?.lcpMs == null ? 'Unavailable' : Number((item.speed.lcpMs / 1000).toFixed(2)), item.speed?.cls ?? 'Unavailable', item.speed?.tbtMs ?? 'Unavailable', item.pagesChecked, item.linksChecked, issueList(item).length, item.uptime?.status ?? 'Unavailable', item.uptime?.responseMs ?? 'Unavailable']), [26, 48, 14, 15, 15, 10, 12, 10, 12, 12, 13, 16, 13, 15]);

  const overview = workbook.addWorksheet('Overview', { views: [{ showGridLines: false }] });
  overview.properties.tabColor = { argb: green };
  overview.columns = [{ width: 28 }, { width: 48 }, { width: 28 }, { width: 48 }];
  overview.mergeCells('A1:D1');
  overview.getCell('A1').value = 'WEBSITE MONITOR AI — AUDIT SUMMARY';
  overview.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
  overview.getCell('A1').font = { name: 'Aptos Display', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  overview.getCell('A1').alignment = { vertical: 'middle' };
  overview.getRow(1).height = 42;
  overview.mergeCells('A2:D2');
  overview.getCell('A2').value = `${current.siteUrl}   |   Scanned: ${new Date(current.checkedAt).toLocaleString()}   |   Generated: ${new Date().toLocaleString()}`;
  overview.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: paleBlue } };
  overview.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: text }, italic: true };
  overview.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  overview.getRow(2).height = 30;
  overview.mergeCells('A3:D3');
  overview.getCell('A3').value = 'Start here: review the severity counts, then open Detailed Findings and use the filters to prioritize work. This report is read-only and does not modify the website.';
  overview.getCell('A3').font = { name: 'Aptos', size: 10, color: { argb: text } };
  overview.getCell('A3').alignment = { wrapText: true, vertical: 'middle' };
  overview.getRow(3).height = 34;
  overview.getRow(4).values = ['Metric', 'Result', 'Metric', 'Result'];
  overview.getRow(4).eachCell((cell: any) => styleHeaderCell(cell));
  overview.getRow(4).height = 28;
  overviewRows.forEach((rowData, idx) => {
    const row = overview.getRow(idx + 5);
    rowData.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value == null ? '' : value instanceof Date ? value : typeof value === 'number' ? value : String(value);
      cell.font = { name: 'Aptos', size: 10, color: { argb: (colIndex + 1) % 2 === 1 ? blue : text }, bold: (colIndex + 1) % 2 === 1 };
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: line } } };
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });
    row.height = 32;
  });
  overview.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  overview.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  overview.headerFooter.oddFooter = '&LWebsite Monitor AI&CPage &P of &N';
  // Open Excel on the quick summary first rather than forcing beginners into the data sheets.
  workbook.views = [{ x: 0, y: 0, width: 10000, height: 20000, activeTab: workbook.worksheets.indexOf(overview), firstSheet: 0, visibility: 'visible' }];

  addDataSheet('Detailed Findings', 'DETAILED FINDINGS & FIX PLAN', `${findings.length} findings · Filter Severity and Category to prioritize · Scan: ${new Date(current.checkedAt).toLocaleString()}`, ['Severity', 'Category', 'Issue / Audit', 'Affected URL', 'What Was Found', 'Why It Matters', 'Recommended Fix', 'WordPress / Elementor Guidance', 'Evidence Source'], findings.map((item) => [item.severity.toUpperCase(), item.category, item.title, item.url || current.siteUrl, item.what, item.impact, item.recommendation, getCmsGuidance(item).join('\n'), item.source || 'Website Monitor AI rule check']), [13, 18, 38, 46, 52, 48, 55, 55, 30], { severityColumn: 0, categoryColumn: 1 });
  addDataSheet('SEO Pages', 'PAGE-LEVEL SEO REVIEW', `${current.seoPages?.length ?? 0} HTML pages · Missing metadata and headings are highlighted in the findings list.`, ['Page URL', 'HTTP Status', 'Title', 'Title Length', 'Meta Description', 'Description Length', 'H1 Count', 'H1 Texts', 'Canonical URL', 'Images', 'Missing Alt Count', 'Images Missing Alt (URLs)', 'SEO Findings'], (current.seoPages ?? []).map((page) => [page.url, page.status, page.title || 'Missing', page.titleLength, page.description || 'Missing', (page.description ?? '').length, page.h1Count, (page.h1Texts ?? []).join(' | '), page.canonical || 'Missing', page.images, page.imagesMissingAlt, (page.missingAltImages ?? []).join('\n'), (page.issues ?? []).join('\n') || 'None detected']), [44, 13, 35, 14, 55, 18, 12, 38, 44, 10, 17, 48, 55]);
  addDataSheet('Redirects', 'REDIRECT HOPS', `${current.redirects?.length ?? 0} same-site redirect hops observed. Redirects to unrelated hosts are not followed.`, ['HTTP Status', 'Source URL', 'Destination URL'], (current.redirects ?? []).map((redirect) => [redirect.status, redirect.from, redirect.to]), [14, 70, 70]);
  addDataSheet('Request Errors', 'BROKEN LINKS & REQUEST ERRORS', `${current.linkIssues?.length ?? 0} same-site link/request error(s) detected.`, ['Affected URL', 'HTTP Status', 'Error / Response Details'], (current.linkIssues ?? []).map((issue) => [issue.url, issue.status ?? 'No response', issue.message]), [70, 16, 70]);
  addDataSheet('Scan Activity', 'TIMESTAMPED SCAN ACTIVITY', `${current.activities?.length ?? 0} activity entries from this run.`, ['Timestamp', 'Step', 'Level', 'Duration (ms)', 'What Happened'], activityEntries.map((activity) => [new Date(activity.timestamp).toLocaleString(), activity.step, activity.level.toUpperCase(), activity.durationMs ?? '', activity.message]), [26, 28, 14, 17, 90], { severityColumn: 2 });
  addDataSheet('Recommendations', 'AI SUMMARY, WARNINGS & NEXT STEPS', 'AI recommendations are advisory. Rule-based results remain available when AI analysis cannot run.', ['Record Type', 'Details'], [
    ['AI summary', current.aiSummary || 'AI summary is not available for this scan.'],
    ...(current.recommendations ?? []).map((item, index) => [`Recommendation ${index + 1}`, item]),
    ...(current.warnings ?? []).map((item) => ['Monitoring warning', item]),
    ['Crawl settings', `URL request limit: ${current.crawlConfig?.limit ?? 'not recorded'}; sitemap scan: ${current.crawlConfig?.sitemapEnabled ? 'enabled' : 'disabled/unknown'}; sitemap URLs discovered: ${current.crawlConfig?.sitemapUrlsDiscovered ?? 'not recorded'}; sitemap sources: ${(current.crawlConfig?.sitemapSources ?? []).join('; ') || 'none recorded'}`],
  ], [28, 115]);

  if (previous && sameSite(current.siteUrl, previous.siteUrl)) {
    const comparisonRows: unknown[][] = [
      ['Finding count', issueList(previous).length, findings.length, findings.length - issueList(previous).length],
      ...(['performance', 'accessibility', 'bestPractices', 'seo'] as const).map((key) => [scoreName(key), metricValue(previous, key) ?? 'Unavailable', metricValue(current, key) ?? 'Unavailable', metricValue(current, key) == null || metricValue(previous, key) == null ? 'Unavailable' : (metricValue(current, key)! - metricValue(previous, key)!)]),
      ['LCP (ms)', previous.speed?.lcpMs ?? 'Unavailable', current.speed?.lcpMs ?? 'Unavailable', previous.speed?.lcpMs == null || current.speed?.lcpMs == null ? 'Unavailable' : current.speed.lcpMs - previous.speed.lcpMs],
      ['CLS', previous.speed?.cls ?? 'Unavailable', current.speed?.cls ?? 'Unavailable', previous.speed?.cls == null || current.speed?.cls == null ? 'Unavailable' : current.speed.cls - previous.speed.cls],
      ['TBT (ms)', previous.speed?.tbtMs ?? 'Unavailable', current.speed?.tbtMs ?? 'Unavailable', previous.speed?.tbtMs == null || current.speed?.tbtMs == null ? 'Unavailable' : current.speed.tbtMs - previous.speed.tbtMs],
      ['New / changed finding count', newFindings.length, '', 'Review new finding rows below'],
      ['No longer detected count', noLongerFindings.length, '', 'Absence is not proof of a permanent fix'],
      ...newFindings.map((item) => ['NEW: ' + item.title, '', item.url || current.siteUrl, item.severity.toUpperCase() + ' · ' + item.category]),
      ...noLongerFindings.map((item) => ['NO LONGER DETECTED: ' + item.title, item.url || current.siteUrl, '', item.severity.toUpperCase() + ' · ' + item.category]),
    ];
    addDataSheet('Previous Scan Comparison', 'CURRENT VS PREVIOUS SCAN', `Current scan: ${new Date(current.checkedAt).toLocaleString()} · Previous scan: ${new Date(previous.checkedAt).toLocaleString()} · Absence of a finding does not guarantee a permanent fix.`, ['Metric / Finding', 'Previous Scan', 'Current Scan / URL', 'Change / Status'], comparisonRows, [44, 32, 50, 40]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${safeFilePart(current.siteUrl)}-audit-report-${date}.xlsx`);
}

function exportCsv(current: ScanResult, previous: ScanResult | null) {
  const activityEntries = uniqueActivities(current.activities);
  const header = ['Record Type', 'Timestamp', 'Website', 'Severity', 'Category', 'Title / Metric', 'Affected URL', 'HTTP Status', 'Current Value', 'What Was Found / Details', 'Why It Matters', 'Recommended Fix', 'Source', 'WordPress / Elementor Guidance'];
  const rows: unknown[][] = [];
  const addRow = (row: unknown[]) => rows.push(row);
  addRow(['Summary', current.checkedAt, current.siteUrl, '', 'Overview', 'Overall status', current.siteUrl, current.uptime?.status ?? '', current.overallStatus, `Response time: ${current.uptime?.responseMs ?? 'Unavailable'} ms; ${current.pagesChecked} HTML pages; ${current.linksChecked} URL requests; limit ${current.crawlConfig?.limit ?? 'unknown'}; sitemap scan ${current.crawlConfig?.sitemapEnabled ? 'enabled' : 'disabled/unknown'}; ${issueList(current).length} findings`, '', '', 'Website Monitor AI']);
  const scoreRows = [
    ['Performance', current.speed?.performance, 'out of 100'], ['Accessibility', current.speed?.accessibility, 'out of 100'],
    ['Best practices', current.speed?.bestPractices, 'out of 100'], ['SEO', current.speed?.seo, 'out of 100'],
    ['LCP', current.speed?.lcpMs, 'milliseconds'], ['CLS', current.speed?.cls, 'score'], ['TBT', current.speed?.tbtMs, 'milliseconds'],
  ];
  for (const [name, value, unit] of scoreRows) addRow(['Metric', current.checkedAt, current.siteUrl, '', 'Performance', name, current.siteUrl, '', value ?? 'Unavailable', `Unit: ${unit}`, '', '', 'Google PageSpeed Insights']);
  for (const item of issueList(current)) addRow(['Finding', current.checkedAt, current.siteUrl, item.severity, item.category, item.title, item.url ?? '', '', '', item.what, item.impact, item.recommendation, item.source ?? '', getCmsGuidance(item).join(' | ')]);
  addRow(['Crawl config', current.checkedAt, current.siteUrl, '', 'Crawl', 'URL request limit', '', '', current.crawlConfig?.limit ?? 'Not recorded in older scan', `Sitemap scan: ${current.crawlConfig?.sitemapEnabled ? 'enabled' : 'disabled/unknown'}; URLs discovered: ${current.crawlConfig?.sitemapUrlsDiscovered ?? 'unknown'}; sitemap files: ${(current.crawlConfig?.sitemapSources ?? []).join('; ') || 'none recorded'}`, '', '', 'Website Monitor AI']);
  for (const page of current.seoPages ?? []) addRow(['SEO page', current.checkedAt, current.siteUrl, '', 'SEO', `Page metadata: ${page.title || 'Missing title'}`, page.url, page.status, `Title ${page.titleLength} chars; description ${(page.description ?? '').length} chars; H1 ${page.h1Count}`, `Title: ${page.title || 'Missing'}; Description: ${page.description || 'Missing'}; H1: ${(page.h1Texts ?? []).join(' | ')}; Canonical: ${page.canonical || 'Missing'}; images missing alt: ${page.imagesMissingAlt}`, (page.issues ?? []).join('; '), '', 'HTML/SEO rule check']);
  for (const redirect of current.redirects ?? []) addRow(['Redirect', current.checkedAt, current.siteUrl, '', 'Redirects', `HTTP ${redirect.status}`, redirect.from, redirect.status, redirect.to, `Redirected from ${redirect.from} to ${redirect.to}`, '', 'Update internal links to point directly to the final URL where practical.', 'Internal link crawl']);
  for (const activity of activityEntries) addRow(['Activity', activity.timestamp, current.siteUrl, activity.level, 'Activity log', activity.step, '', '', activity.durationMs ?? '', activity.message, '', '', 'Monitoring activity']);
  for (const warning of current.warnings ?? []) addRow(['Warning', current.checkedAt, current.siteUrl, 'warning', 'Monitoring', 'Scan warning', current.siteUrl, '', '', warning, '', '', 'Website Monitor AI']);
  if (previous && sameSite(current.siteUrl, previous.siteUrl)) {
    const currentKeys = new Set(issueList(current).map(normalizedIssueKey));
    const previousKeys = new Set(issueList(previous).map(normalizedIssueKey));
    for (const issue of issueList(current).filter((item) => !previousKeys.has(normalizedIssueKey(item)))) addRow(['Comparison', current.checkedAt, current.siteUrl, issue.severity, issue.category, `New / changed: ${issue.title}`, issue.url ?? '', '', '', issue.what, issue.impact, issue.recommendation, `Compared with scan ${previous.checkedAt}`]);
    for (const issue of issueList(previous).filter((item) => !currentKeys.has(normalizedIssueKey(item)))) addRow(['Comparison', current.checkedAt, current.siteUrl, issue.severity, issue.category, `No longer detected: ${issue.title}`, issue.url ?? '', '', '', issue.what, issue.impact, '', `Previous scan ${previous.checkedAt}`]);
  }
  const csv = [header, ...rows.map((row) => [...row, ...Array(Math.max(0, header.length - row.length)).fill('')])].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const date = current.checkedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  downloadBlob(`\uFEFF${csv}`, 'text/csv;charset=utf-8;', `${safeFilePart(current.siteUrl)}-audit-report-${date}.csv`);
}

function ComparisonMetric({ label, current, previous, digits = 0, suffix = '', lowerIsBetter = false }: { label: string; current: number | null | undefined; previous: number | null | undefined; digits?: number; suffix?: string; lowerIsBetter?: boolean }) {
  if (current == null || previous == null) return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-bold">Unavailable</p><p className="mt-1 text-xs text-slate-400">One or both scans did not return this metric</p></div>;
  const delta = current - previous;
  const improved = delta === 0 ? null : lowerIsBetter ? delta < 0 : delta > 0;
  const deltaLabel = `${delta > 0 ? '+' : delta < 0 ? '-' : ''}${Math.abs(delta).toFixed(digits)}${suffix}`;
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-bold">{current.toFixed(digits)}{suffix}</p><p className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${improved === null ? 'text-slate-500' : improved ? 'text-emerald-700' : 'text-amber-700'}`}>{delta === 0 ? <Minus size={13}/> : delta > 0 ? <ArrowUp size={13}/> : <ArrowDown size={13}/>} {deltaLabel} vs previous</p><p className="mt-1 text-[11px] text-slate-400">Previous: {previous.toFixed(digits)}{suffix}</p></div>;
}

export function ScanComparison({ current, previous }: Props) {
  if (!previous) return <section className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-white p-5"><div className="flex items-center gap-2"><GitCompareArrows size={20} className="text-slate-400"/><h2 className="font-bold">Compare with previous scan</h2></div><p className="mt-2 text-sm text-slate-500">A previous saved scan for this website is not available yet. Once two scans are saved in Supabase, score changes and issues that are new or no longer detected will appear here.</p></section>;
  const currentIssues = issueList(current);
  const previousIssues = issueList(previous);
  // Issue counts are not a fair before/after comparison when one scan inspected
  // many more pages or used a different crawl/sitemap configuration.
  const coverageDiffers = current.pagesChecked !== previous.pagesChecked
    || current.linksChecked !== previous.linksChecked
    || current.crawlConfig?.limit !== previous.crawlConfig?.limit
    || current.crawlConfig?.sitemapEnabled !== previous.crawlConfig?.sitemapEnabled;
  const currentKeys = new Set(currentIssues.map(normalizedIssueKey));
  const previousKeys = new Set(previousIssues.map(normalizedIssueKey));
  const newIssues = currentIssues.filter((issue) => !previousKeys.has(normalizedIssueKey(issue)));
  const noLongerDetected = previousIssues.filter((issue) => !currentKeys.has(normalizedIssueKey(issue)));
  const findingDelta = currentIssues.length - previousIssues.length;
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><GitCompareArrows size={20} className="text-brand-700"/><h2 className="font-bold">Compare with previous scan</h2></div><p className="mt-1 text-xs text-slate-500">Current: {new Date(current.checkedAt).toLocaleString()} · Previous: {new Date(previous.checkedAt).toLocaleString()}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${coverageDiffers ? 'bg-amber-50 text-amber-800' : findingDelta < 0 ? 'bg-emerald-50 text-emerald-700' : findingDelta > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{findingDelta > 0 ? '+' : ''}{findingDelta} findings{coverageDiffers ? ' · coverage differs' : ''}</span></div>
    {coverageDiffers && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900"><strong>Scans cover different amounts of the site.</strong> Current scan: {current.pagesChecked} HTML page(s), {current.linksChecked} URL request(s), limit {current.crawlConfig?.limit ?? 'not recorded'}, sitemap {current.crawlConfig ? (current.crawlConfig.sitemapEnabled ? 'enabled' : 'disabled') : 'not recorded'}. Previous scan: {previous.pagesChecked} HTML page(s), {previous.linksChecked} URL request(s), limit {previous.crawlConfig?.limit ?? 'not recorded'}, sitemap {previous.crawlConfig ? (previous.crawlConfig.sitemapEnabled ? 'enabled' : 'disabled') : 'not recorded'}. The finding-count change and “no longer detected” list may reflect crawl coverage, so they should not be interpreted as issues fixed without checking the affected pages.</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ComparisonMetric label="Performance" current={current.speed?.performance} previous={previous.speed?.performance}/><ComparisonMetric label="Accessibility" current={current.speed?.accessibility} previous={previous.speed?.accessibility}/><ComparisonMetric label="Best practices" current={current.speed?.bestPractices} previous={previous.speed?.bestPractices}/><ComparisonMetric label="SEO score" current={current.speed?.seo} previous={previous.speed?.seo}/><ComparisonMetric label="LCP" current={current.speed?.lcpMs == null ? null : current.speed.lcpMs / 1000} previous={previous.speed?.lcpMs == null ? null : previous.speed.lcpMs / 1000} digits={2} suffix=" s" lowerIsBetter/><ComparisonMetric label="CLS" current={current.speed?.cls} previous={previous.speed?.cls} digits={3} lowerIsBetter/><ComparisonMetric label="TBT" current={current.speed?.tbtMs} previous={previous.speed?.tbtMs} suffix=" ms" lowerIsBetter/></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><h3 className="flex items-center gap-2 text-sm font-bold"><AlertTriangle size={16} className="text-amber-600"/>New / changed findings ({newIssues.length})</h3>{newIssues.length ? <ul className="mt-3 space-y-2">{newIssues.slice(0, 8).map((issue) => <li key={issue.id} className="text-sm text-slate-700"><span className={`mr-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${issue.severity === 'critical' || issue.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{issue.severity}</span>{issue.title}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No new findings detected.</p>}</div><div className="rounded-xl border border-slate-200 p-4"><h3 className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 size={16} className="text-emerald-600"/>No longer detected ({noLongerDetected.length})</h3>{noLongerDetected.length ? <ul className="mt-3 space-y-2">{noLongerDetected.slice(0, 8).map((issue) => <li key={issue.id} className="text-sm text-slate-700">{issue.title}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No previous findings disappeared in this scan.</p>}<p className="mt-3 text-[11px] text-slate-400">Absence from this scan does not guarantee a permanent fix; verify important items manually.</p></div></div>
  </section>;
}

export function ReportTools({ current, previous, history = [] }: Props) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportError, setExportError] = useState('');
  const onPdf = async () => {
    setExportingPdf(true); setExportError('');
    try { await exportPdf(current, previous, history); }
    catch (error) { setExportError(error instanceof Error ? error.message : 'PDF export failed.'); }
    finally { setExportingPdf(false); }
  };
  const onExcel = async () => {
    setExportingExcel(true); setExportError('');
    try { await exportExcel(current, previous, history); }
    catch (error) { setExportError(error instanceof Error ? error.message : 'Excel workbook export failed.'); }
    finally { setExportingExcel(false); }
  };
  const onCsv = () => {
    setExportError('');
    try { exportCsv(current, previous); }
    catch (error) { setExportError(error instanceof Error ? error.message : 'CSV export failed.'); }
  };
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">Download audit report</h2><p className="mt-1 text-sm text-slate-500">Download a landscape PDF, a formatted multi-sheet Excel workbook, or a simple CSV. Includes findings, SEO, redirects, crawl settings, scan activity, and previous-scan comparison.</p></div><div className="flex flex-wrap gap-2"><button onClick={onPdf} disabled={exportingPdf} className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60"><FileText size={16}/>{exportingPdf ? 'Preparing PDF…' : 'Download PDF (Landscape)'}</button><button onClick={onExcel} disabled={exportingExcel} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"><FileSpreadsheet size={16}/>{exportingExcel ? 'Preparing Excel…' : 'Download Excel (.xlsx)'}</button><button onClick={onCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={16}/>CSV</button></div></div>{exportError && <p role="alert" className="mt-3 text-sm text-red-700">{exportError}</p>}</section>;
}
