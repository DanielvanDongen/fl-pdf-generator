import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { SessionRecord } from "./airtable";

// Brand colors
const FL_GREEN = "#00C136";
const DARK = "#1A1A1A";
const GRAY = "#6B7280";
const LIGHT_GRAY = "#F3F4F6";
const BORDER = "#E5E7EB";

Font.register({
  family: "Helvetica",
  fonts: [], // built-in, no download needed
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: "#FFFFFF",
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 48,
    color: DARK,
    fontSize: 10,
  },

  // ── Header ──────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: FL_GREEN,
  },
  logo: {
    width: 56,
    height: 56,
    objectFit: "contain",
  },
  headerRight: {
    alignItems: "flex-end",
  },
  brandName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: FL_GREEN,
    letterSpacing: 1.5,
  },
  docTitle: {
    fontSize: 9,
    color: GRAY,
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // ── Session Meta ─────────────────────────────────────
  metaBox: {
    backgroundColor: LIGHT_GRAY,
    borderRadius: 4,
    padding: 14,
    marginBottom: 20,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metaItem: {
    width: "50%",
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 7.5,
    color: GRAY,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  typeBadge: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
  },
  typeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: FL_GREEN,
    marginRight: 5,
  },

  // ── Sections ─────────────────────────────────────────
  section: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionBar: {
    width: 3,
    height: 12,
    backgroundColor: FL_GREEN,
    marginRight: 8,
    borderRadius: 1.5,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: FL_GREEN,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionContent: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 12,
    lineHeight: 1.6,
    fontSize: 10,
    color: DARK,
  },

  // ── List Items (To-Dos, Affirmationen) ───────────────
  listItem: {
    flexDirection: "row",
    marginBottom: 5,
  },
  bullet: {
    width: 14,
    color: FL_GREEN,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  listText: {
    flex: 1,
    lineHeight: 1.5,
    fontSize: 10,
    color: DARK,
  },

  // ── Footer ───────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  footerText: {
    fontSize: 7.5,
    color: GRAY,
  },
  footerBrand: {
    fontSize: 7.5,
    color: FL_GREEN,
    fontFamily: "Helvetica-Bold",
  },
});

function formatDate(dateStr: string): string {
  if (!dateStr) return "–";
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function renderRichLines(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

interface Props {
  session: SessionRecord;
  logoUrl: string;
}

export function SessionPDF({ session, logoUrl }: Props) {
  const sel = session.exportSelection;
  const showNotizen = sel.includes("Notiz") || sel.length === 0;
  const showToDos = sel.includes("To-Dos");
  const showRoutinen = sel.includes("Routinen");
  const showAffirmationen = sel.includes("Affirmation");

  const sessionDate = formatDate(session.datum);

  return (
    <Document
      title={`Session – ${session.spielerName} – ${sessionDate}`}
      author="Football Leverage"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image src={logoUrl} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.brandName}>FOOTBALL LEVERAGE</Text>
            <Text style={styles.docTitle}>SESSION PROTOKOLL · VERTRAULICH</Text>
          </View>
        </View>

        {/* Session Meta */}
        <View style={styles.metaBox}>
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Datum</Text>
              <Text style={styles.metaValue}>{sessionDate}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Session-Typ</Text>
              <View style={styles.typeBadge}>
                <View style={styles.typeDot} />
                <Text style={styles.metaValue}>{session.sessionTyp}</Text>
              </View>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Spieler</Text>
              <Text style={styles.metaValue}>{session.spielerName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Coach</Text>
              <Text style={styles.metaValue}>{session.coachName}</Text>
            </View>
            {session.dauer && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Dauer</Text>
                <Text style={styles.metaValue}>{session.dauer} Minuten</Text>
              </View>
            )}
            {session.medium && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Medium</Text>
                <Text style={styles.metaValue}>{session.medium}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Notizen */}
        {showNotizen && session.notizen && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>Session Notizen</Text>
            </View>
            <View style={styles.sectionContent}>
              {renderRichLines(session.notizen).map((line, i) => (
                <Text key={i}>{line}</Text>
              ))}
            </View>
          </View>
        )}

        {/* To-Dos */}
        {showToDos && session.toDos && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>To-Dos</Text>
            </View>
            <View style={styles.sectionContent}>
              {renderRichLines(session.toDos).map((line, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>›</Text>
                  <Text style={styles.listText}>{line}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Routinen */}
        {showRoutinen && session.routinen && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>Routinen</Text>
            </View>
            <View style={styles.sectionContent}>
              {renderRichLines(session.routinen).map((line, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>›</Text>
                  <Text style={styles.listText}>{line}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Affirmationen */}
        {showAffirmationen && session.affirmationen && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>Affirmationen</Text>
            </View>
            <View style={styles.sectionContent}>
              {renderRichLines(session.affirmationen).map((line, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>›</Text>
                  <Text style={styles.listText}>{line}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Erstellt am {new Date().toLocaleDateString("de-DE")} · Nur für
            interne Verwendung
          </Text>
          <Text style={styles.footerBrand}>Football Leverage®</Text>
        </View>
      </Page>
    </Document>
  );
}
