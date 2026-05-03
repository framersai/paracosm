<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Sitemap | Paracosm</title>
        <meta name="robots" content="noindex"/>
        <style>
          :root { color-scheme: light dark; }
          html, body { margin: 0; padding: 0; }
          body {
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #1a1a1a;
            background: #fafafa;
            padding: 32px 24px;
          }
          @media (prefers-color-scheme: dark) {
            body { color: #e5e5e5; background: #0f0f10; }
            a { color: #7ab8ff; }
            .summary { background: #1a1a1c; border-color: #2a2a2c; }
            th { background: #1a1a1c; border-bottom-color: #2a2a2c; }
            td { border-bottom-color: #1f1f21; }
            tr:hover td { background: #15151a; }
            .priority-high { color: #4ade80; }
            .priority-mid { color: #facc15; }
            .priority-low { color: #94a3b8; }
            .lang-chip { background: #1f2937; color: #9ca3af; border-color: #2d3748; }
          }
          .wrap { max-width: 1100px; margin: 0 auto; }
          h1 { font-size: 22px; margin: 0 0 4px; font-weight: 700; }
          .lede { color: #6b7280; margin: 0 0 24px; font-size: 13px; }
          .summary {
            background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
            padding: 12px 16px; margin: 0 0 24px;
            font-size: 13px; color: #475569;
          }
          .summary strong { color: #1a1a1a; font-weight: 600; }
          @media (prefers-color-scheme: dark) {
            .summary strong { color: #e5e5e5; }
            .lede { color: #94a3b8; }
          }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            text-align: left; padding: 10px 12px;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: top;
          }
          th {
            position: sticky; top: 0;
            background: #fff;
            font-size: 11px; font-weight: 700;
            text-transform: uppercase; letter-spacing: .04em;
            color: #6b7280;
            border-bottom: 2px solid #e5e7eb;
          }
          td { font-size: 13px; }
          tr:hover td { background: #f3f4f6; }
          a { color: #2563eb; text-decoration: none; word-break: break-all; }
          a:hover { text-decoration: underline; }
          .priority-high { color: #16a34a; font-weight: 600; }
          .priority-mid  { color: #ca8a04; font-weight: 600; }
          .priority-low  { color: #64748b; }
          .lang-chip {
            display: inline-block;
            font-family: ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            background: #f1f5f9;
            color: #475569;
            border: 1px solid #e2e8f0;
            margin-right: 4px;
            margin-bottom: 2px;
          }
          .num { text-align: right; font-variant-numeric: tabular-nums; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>XML Sitemap</h1>
          <p class="lede">
            This is a machine-readable sitemap. Search engines parse the
            underlying XML directly — this view is just for humans.
          </p>
          <div class="summary">
            <strong><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></strong> URLs.
            Spec: <a href="https://www.sitemaps.org/protocol.html">sitemaps.org/protocol.html</a>.
          </div>
          <table>
            <thead>
              <tr>
                <th>URL</th>
                <th class="num">Priority</th>
                <th>Change frequency</th>
                <th>Last modified</th>
                <th>Alternate languages</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <xsl:sort select="sitemap:priority" data-type="number" order="descending"/>
                <tr>
                  <td>
                    <a>
                      <xsl:attribute name="href"><xsl:value-of select="sitemap:loc"/></xsl:attribute>
                      <xsl:value-of select="sitemap:loc"/>
                    </a>
                  </td>
                  <td class="num">
                    <xsl:variable name="p" select="number(sitemap:priority)"/>
                    <xsl:choose>
                      <xsl:when test="$p &gt;= 0.8"><span class="priority-high"><xsl:value-of select="sitemap:priority"/></span></xsl:when>
                      <xsl:when test="$p &gt;= 0.5"><span class="priority-mid"><xsl:value-of select="sitemap:priority"/></span></xsl:when>
                      <xsl:otherwise><span class="priority-low"><xsl:value-of select="sitemap:priority"/></span></xsl:otherwise>
                    </xsl:choose>
                  </td>
                  <td><xsl:value-of select="sitemap:changefreq"/></td>
                  <td><xsl:value-of select="sitemap:lastmod"/></td>
                  <td>
                    <xsl:for-each select="xhtml:link[@rel='alternate']">
                      <span class="lang-chip"><xsl:value-of select="@hreflang"/></span>
                    </xsl:for-each>
                  </td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
