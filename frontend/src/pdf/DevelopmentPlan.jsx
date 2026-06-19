// Individual Development Plan — a kind, growth-oriented document an attorney
// can download for themselves. Same Counsel letterhead as the other PDFs.
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { s, Header, Footer } from "./letterhead.jsx";

export default function DevelopmentPlan({ plan, attorneyName, date }) {
  if (!plan) return null;
  const when = date || new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header title="Individual Development Plan" subtitle={when} />

        {attorneyName ? <Text style={s.h2}>{attorneyName}</Text> : null}

        {plan.openingNote ? <Text style={s.para}>{plan.openingNote}</Text> : null}

        {plan.strengthsToBuildOn && plan.strengthsToBuildOn.length > 0 && (
          <View>
            <Text style={s.h2}>Strengths to build on</Text>
            {plan.strengthsToBuildOn.map((str, i) => (
              <Text key={i} style={s.para}>•  {str}</Text>
            ))}
          </View>
        )}

        {plan.growthAreas && plan.growthAreas.length > 0 && (
          <View>
            <Text style={s.h2}>Growth areas</Text>
            {plan.growthAreas.map((g, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 8 }}>
                <Text style={s.title}>{g.area}</Text>
                {g.why ? <Text style={[s.para, s.muted]}>{g.why}</Text> : null}
                {(g.actions || []).map((a, j) => (
                  <Text key={j} style={{ lineHeight: 1.5, marginLeft: 10 }}>—  {a}</Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {plan.suggestedGoals && plan.suggestedGoals.length > 0 && (
          <View>
            <Text style={s.h2}>Suggested goals for next cycle</Text>
            {plan.suggestedGoals.map((g, i) => (
              <View key={i} style={s.cell}>
                <Text style={s.title}>{g.title}</Text>
                <Text style={[s.muted, { maxWidth: "60%", textAlign: "right" }]}>{g.detail}</Text>
              </View>
            ))}
          </View>
        )}

        {plan.encouragement ? (
          <View>
            <View style={s.rule} />
            <Text style={[s.para, { fontFamily: "Times-Italic" }]}>{plan.encouragement}</Text>
          </View>
        ) : null}

        <Footer />
      </Page>
    </Document>
  );
}
