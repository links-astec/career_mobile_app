// GCareers — React Native Expo App
// Put your Groq API key on line 15 before running.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, Modal, Dimensions, FlatList,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

const GROQ_KEY = process.env.GROQ_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SW = Dimensions.get('window').width;

// ─── GROQ ─────────────────────────────────────────────────────────────────────
async function ai(msgs: any[], json = false, tokens = 600): Promise<string> {
  const body: any = { model: 'llama-3.3-70b-versatile', max_tokens: tokens, temperature: 0.8, messages: msgs };
  if (json) body.response_format = { type: 'json_object' };
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? '';
}

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Tab = 'home' | 'ats' | 'jobs' | 'interview' | 'study' | 'search';
type Lang = 'en' | 'fr';
type Dark = 'dark' | 'light';
type JobStatus = 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';
type IVMode = 'mixed' | 'technical' | 'behavioral' | 'ml_deep';
type Phase = 'setup' | 'active' | 'complete';
interface Job { id: number; role: string; company: string; status: JobStatus; ats: number | null; deadline: string; notes: string; }
interface Topic { id: number; name: string; desc: string; progress: number; }
interface Msg { role: 'user' | 'assistant'; content: string; }

// ─── SEED ─────────────────────────────────────────────────────────────────────
const JOBS0: Job[] = [
  { id: 1, role: 'ML Engineer Intern', company: 'Thales', status: 'applied', ats: 82, deadline: '2026-05-01', notes: '' },
  { id: 2, role: 'AI Research Intern', company: 'Inria', status: 'interview', ats: 76, deadline: '2026-05-10', notes: 'Interview May 5' },
  { id: 3, role: 'Data Scientist Intern', company: 'Orange', status: 'saved', ats: null, deadline: '2026-05-25', notes: '' },
];
const TOPICS0: Topic[] = [
  { id: 1, name: 'Transformers & Attention', desc: 'Self-attention, BERT, GPT', progress: 70 },
  { id: 2, name: 'Reinforcement Learning', desc: 'MDP, Q-learning, PPO', progress: 40 },
  { id: 3, name: 'CNN & ResNet', desc: 'Convolutional nets, transfer learning', progress: 85 },
  { id: 4, name: 'NLP & LLMs', desc: 'Tokenization, fine-tuning', progress: 60 },
  { id: 5, name: 'MLOps', desc: 'Docker, CI/CD, MLflow', progress: 20 },
];
const QBANK = {
  technical: [
    { q: 'Explain the bias-variance tradeoff.', a: 'High bias = underfitting, high variance = overfitting. Balance via regularization, cross-validation, ensembles.' },
    { q: 'How does backpropagation work?', a: 'Computes gradients via chain rule from output to input. Updates weights using those gradients × learning rate.' },
    { q: 'Explain CNN vs RNN.', a: 'CNNs: spatial hierarchy for images. RNNs: sequential state for time series. LSTMs fix vanishing gradients.' },
    { q: 'What is gradient descent?', a: 'Iterative optimizer. Batch: all data. SGD: one sample. Mini-batch: small groups. Adam adds adaptive rates.' },
  ],
  behavioral: [
    { q: 'Tell me about a challenging project.', a: 'Use STAR: Situation, Task, Action, Result. Focus on your contribution and measurable outcome.' },
    { q: 'How do you handle ambiguity?', a: 'Break into sub-problems, ask early clarifying questions, prototype fast, iterate.' },
    { q: 'Why do you want to work in AI/ML?', a: "Link personal passion to concrete examples. Connect to the company's specific AI work." },
  ],
  ml: [
    { q: 'Explain attention in Transformers.', a: 'Scaled dot-product of Q and K gives weights, applied to V. Multi-head runs in parallel subspaces.' },
    { q: 'What regularization exists in deep learning?', a: 'L1/L2, Dropout, BatchNorm, Early stopping — each targets different overfitting causes.' },
    { q: 'How do you handle class imbalance?', a: 'SMOTE, undersampling, class weights, focal loss. Evaluate with F1/AUC not accuracy.' },
  ],
};
const STATUS_ALL: JobStatus[] = ['saved', 'applied', 'interview', 'offer', 'rejected'];

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const gget = async (k: string, fb: any): Promise<any> => {
  try { const v = await AsyncStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; }
};
const sset = async (k: string, v: any) => {
  try { await AsyncStorage.setItem(k, JSON.stringify(v)); } catch { }
};

// ─── COLORS ───────────────────────────────────────────────────────────────────
const DARK = { bg: '#08080f', card: '#0f0f1e', border: 'rgba(255,255,255,0.08)', tx: '#f0f0ff', tx2: '#8888b0', tx3: '#44445a', g: '#00ffaa', b: '#4d9fff', r: '#ff4d6d', y: '#ffd60a', o: '#ff7a3d', p: '#a855f7' };
const LIGHT = { bg: '#f0f2f7', card: '#ffffff', border: 'rgba(0,0,0,0.09)', tx: '#0a0a18', tx2: '#3a3a5c', tx3: '#8888a0', g: '#009966', b: '#1a6fd4', r: '#cc2244', y: '#b88a00', o: '#d45a00', p: '#8020d0' };

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const daysUntil = (s: string) => {
  if (!s) return Infinity;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  const n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.ceil((t.getTime() - n.getTime()) / 86400000);
};
const scoreColor = (n: number, C: any) => n >= 75 ? C.g : n >= 55 ? C.y : C.r;

// ─── TINY COMPONENTS ──────────────────────────────────────────────────────────
function ProgressBar({ val, color }: { val: number; color: string }) {
  return (
    <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ height: 6, width: `${Math.min(100, Math.max(0, val))}%` as any, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

function PrimaryBtn({ label, onPress, color, textColor = '#000', disabled = false, style = {} }: any) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.75}
      style={[{ backgroundColor: disabled ? 'rgba(255,255,255,0.1)' : color, borderRadius: 12, paddingVertical: 15, alignItems: 'center' as const }, style]}>
      <Text style={{ color: disabled ? 'rgba(255,255,255,0.3)' : textColor, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field({ val, onChange, placeholder, multiline = false, C }: any) {
  return (
    <TextInput
      value={val} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={C.tx3} multiline={multiline}
      style={{
        backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 12, color: C.tx, fontSize: 14,
        minHeight: multiline ? 90 : 48, textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [lang, setLang] = useState<Lang>('en');
  const [dark, setDark] = useState<Dark>('dark');
  const [jobs, setJobs] = useState<Job[]>(JOBS0);
  const [topics, setTopics] = useState<Topic[]>(TOPICS0);
  const [bestATS, setBestATS] = useState(0);
  const C = dark === 'dark' ? DARK : LIGHT;

  useEffect(() => {
    (async () => {
      setLang(await gget('lang', 'en'));
      setDark(await gget('dark', 'dark'));
      setJobs(await gget('jobs', JOBS0));
      setTopics(await gget('topics', TOPICS0));
      setBestATS(await gget('ats', 0));
    })();
  }, []);

  useEffect(() => { sset('lang', lang); }, [lang]);
  useEffect(() => { sset('dark', dark); }, [dark]);
  useEffect(() => { sset('jobs', jobs); }, [jobs]);
  useEffect(() => { sset('topics', topics); }, [topics]);
  useEffect(() => { sset('ats', bestATS); }, [bestATS]);

  const TABS = [
    { id: 'home' as Tab, icon: '⌂', en: 'Home', fr: 'Accueil' },
    { id: 'ats' as Tab, icon: '◈', en: 'ATS', fr: 'ATS' },
    { id: 'jobs' as Tab, icon: '◎', en: 'Jobs', fr: 'Offres' },
    { id: 'interview' as Tab, icon: '🎤', en: 'Interview', fr: 'Entretien' },
    { id: 'study' as Tab, icon: '◆', en: 'Study', fr: 'Études' },
    { id: 'search' as Tab, icon: '⌕', en: 'Search', fr: 'Recherche' },
  ];

  const renderScreen = () => {
    switch (tab) {
      case 'home': return <HomeScreen C={C} lang={lang} jobs={jobs} topics={topics} bestATS={bestATS} setTab={setTab} />;
      case 'ats': return <ATSScreen C={C} lang={lang} bestATS={bestATS} setBestATS={setBestATS} />;
      case 'jobs': return <JobsScreen C={C} lang={lang} jobs={jobs} setJobs={setJobs} />;
      case 'interview': return <InterviewScreen C={C} lang={lang} />;
      case 'study': return <StudyScreen C={C} lang={lang} topics={topics} setTopics={setTopics} />;
      case 'search': return <SearchScreen C={C} lang={lang} />;
      default: return null;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.card }} edges={['top']}>
        <StatusBar barStyle={dark === 'dark' ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <View style={{ height: 52, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
          <Text style={{ flex: 1, color: C.g, fontSize: 18, fontWeight: '800', letterSpacing: -0.5 }}>
            G<Text style={{ color: C.tx3, fontWeight: '400' }}>_</Text>CAREERS
          </Text>
          <View style={{ flexDirection: 'row', backgroundColor: C.bg, borderRadius: 20, padding: 3, borderWidth: 1, borderColor: C.border, marginRight: 8 }}>
            {(['en', 'fr'] as Lang[]).map(l => (
              <TouchableOpacity key={l} onPress={() => setLang(l)}
                style={{ paddingVertical: 3, paddingHorizontal: 10, borderRadius: 14, backgroundColor: lang === l ? C.g : 'transparent' }}>
                <Text style={{ color: lang === l ? '#000' : C.tx3, fontSize: 10, fontWeight: '700' }}>{l.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setDark((d: Dark) => d === 'dark' ? 'light' : 'dark')}
            style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16 }}>{dark === 'dark' ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>

        {/* Screen */}
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          {renderScreen()}
        </View>

        {/* Bottom Nav */}
        <View style={{ flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 20 : 10 }}>
          {TABS.map(t => (
            <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} activeOpacity={0.7}
              style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ width: 36, height: 32, borderRadius: 10, backgroundColor: tab === t.id ? C.g + '22' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 17 }}>{t.icon}</Text>
              </View>
              <Text style={{ color: tab === t.id ? C.g : C.tx3, fontSize: 9, fontWeight: '700', marginTop: 2 }}>
                {lang === 'fr' ? t.fr : t.en}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeScreen({ C, lang, jobs, topics, bestATS, setTab }: any) {
  const upcoming = jobs
    .filter((j: Job) => j.deadline && j.status !== 'rejected' && j.status !== 'offer' && daysUntil(j.deadline) >= 0)
    .map((j: Job) => ({ ...j, d: daysUntil(j.deadline) }))
    .sort((a: any, b: any) => a.d - b.d)
    .slice(0, 4);

  const STATS = [
    { val: bestATS > 0 ? `${bestATS}%` : '—', label: 'Best ATS', color: C.g },
    { val: jobs.length, label: lang === 'fr' ? 'Candidatures' : 'Applications', color: C.b },
    { val: topics.length, label: lang === 'fr' ? 'Sujets' : 'Topics', color: C.p },
    { val: jobs.filter((j: Job) => j.status === 'interview').length, label: 'Interviews', color: C.o },
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: C.tx, fontSize: 24, fontWeight: '800', marginBottom: 4 }}>
        Mission <Text style={{ color: C.g }}>Control</Text>
      </Text>
      <Text style={{ color: C.tx3, fontSize: 12, marginBottom: 16 }}>
        {lang === 'fr' ? "Votre carrière en un coup d'œil" : 'Your career at a glance'}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
        {STATS.map((st, i) => (
          <View key={st.label} style={{
            width: (SW - 42) / 2, marginRight: i % 2 === 0 ? 10 : 0, marginBottom: 10,
            backgroundColor: C.card, borderRadius: 12, padding: 14,
            borderWidth: 1, borderColor: C.border, overflow: 'hidden',
          }}>
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: st.color }} />
            <Text style={{ color: st.color, fontSize: 26, fontWeight: '800', letterSpacing: -1 }}>{st.val}</Text>
            <Text style={{ color: C.tx3, fontSize: 11, marginTop: 4 }}>{st.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 16 }}>
        <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1.5, marginBottom: 10 }}>
          {lang === 'fr' ? '// ÉCHÉANCES' : '// DEADLINES'}
        </Text>
        {upcoming.length === 0 ? (
          <Text style={{ color: C.tx3, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
            {lang === 'fr' ? 'Aucune échéance' : 'No upcoming deadlines'}
          </Text>
        ) : upcoming.map((j: any, idx: number) => {
          const uc = j.d <= 1 ? C.r : j.d <= 7 ? C.y : C.g;
          const dl = j.d === 0 ? 'Today!' : j.d === 1 ? 'Tomorrow' : `${lang === 'fr' ? 'Dans ' : 'In '}${j.d}d`;
          return (
            <View key={j.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: idx < upcoming.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: uc, marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.tx2, fontSize: 13 }}>{j.role} — {j.company}</Text>
                <Text style={{ color: C.tx3, fontSize: 11, marginTop: 2 }}>{j.deadline}</Text>
              </View>
              <Text style={{ color: uc, fontSize: 11, fontWeight: '700' }}>{dl}</Text>
            </View>
          );
        })}
      </View>

      <PrimaryBtn
        label={`◈ ${lang === 'fr' ? 'Analyser mon CV' : 'Analyze CV with ATS'}`}
        onPress={() => setTab('ats')}
        color={C.g}
      />
    </ScrollView>
  );
}

// ─── ATS ──────────────────────────────────────────────────────────────────────
function ATSScreen({ C, lang, bestATS, setBestATS }: any) {
  const [cv, setCv] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const analyze = async () => {
    if (!cv.trim() || !desc.trim()) {
      Alert.alert('⚠️', lang === 'fr' ? 'CV et description requis' : 'Add CV and job description');
      return;
    }
    setLoading(true); setResult(null);
    try {
      const prompt = `You are an ATS expert. Return ONLY valid JSON (no markdown, no explanation).
Example format:
{"score":72,"keywords_score":70,"skills_score":65,"experience_score":75,"format_score":80,"education_match":70,"verdict":"Good match","keywords_found":["python","pytorch"],"keywords_partial":["mlops"],"keywords_missing":["kubernetes"],"strengths":["Strong ML background"],"weaknesses":["Missing cloud experience"],"suggestions":["Add Docker projects","Mention GCP"],"recommendations":"Quantify your bullet points with metrics.","salary_estimate":"35,000-42,000 EUR/year (intern)"}

CV: ${cv.slice(0, 1500)}
Job Title: ${jobTitle}
Company: ${company}
Job Description: ${desc.slice(0, 1500)}
Language: ${lang === 'fr' ? 'French' : 'English'}`;
      const raw = await ai([{ role: 'user', content: prompt }], true, 900);
      const parsed = JSON.parse(raw);
      setResult(parsed);
      if (parsed.score > bestATS) setBestATS(parsed.score);
    } catch (e) { Alert.alert('Error', String(e)); }
    setLoading(false);
  };

  if (result) return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: C.tx, fontSize: 22, fontWeight: '800', marginBottom: 14 }}>ATS <Text style={{ color: C.g }}>Result</Text></Text>

      <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12, alignItems: 'center' }}>
        <Text style={{ color: scoreColor(result.score, C), fontSize: 60, fontWeight: '800' }}>{result.score}%</Text>
        <Text style={{ color: C.tx3, fontSize: 13, marginBottom: 16 }}>{result.verdict}</Text>
        {[
          { label: lang === 'fr' ? 'Mots-clés' : 'Keywords', val: result.keywords_score || 0, col: C.g },
          { label: lang === 'fr' ? 'Compétences' : 'Skills', val: result.skills_score || 0, col: C.b },
          { label: lang === 'fr' ? 'Expérience' : 'Experience', val: result.experience_score || 0, col: C.o },
          { label: 'Format', val: result.format_score || 0, col: C.p },
          { label: lang === 'fr' ? 'Formation' : 'Education', val: result.education_match || 0, col: C.y },
        ].map(({ label, val, col }) => (
          <View key={label} style={{ width: '100%', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: C.tx2, fontSize: 12 }}>{label}</Text>
              <Text style={{ color: C.tx2, fontSize: 12 }}>{val}%</Text>
            </View>
            <ProgressBar val={val} color={col} />
          </View>
        ))}
        {result.salary_estimate ? <Text style={{ color: C.g, fontSize: 12, marginTop: 6 }}>💰 {result.salary_estimate}</Text> : null}
      </View>

      <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
        <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1.5, marginBottom: 12 }}>// KEYWORDS</Text>
        {[
          { label: `✓ ${lang === 'fr' ? 'Trouvé' : 'Found'}`, items: result.keywords_found || [], color: C.g },
          { label: `⚡ ${lang === 'fr' ? 'Partiel' : 'Partial'}`, items: result.keywords_partial || [], color: C.y },
          { label: `✗ ${lang === 'fr' ? 'Manquants' : 'Missing'}`, items: result.keywords_missing || [], color: C.r },
        ].map(({ label, items, color }) => (
          <View key={label} style={{ marginBottom: 12 }}>
            <Text style={{ color, fontSize: 11, marginBottom: 6 }}>{label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {items.map((k: string) => (
                <View key={k} style={{ backgroundColor: color + '18', borderRadius: 20, borderWidth: 1, borderColor: color + '44', paddingHorizontal: 10, paddingVertical: 3, marginRight: 6, marginBottom: 6 }}>
                  <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{k}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 }}>
        <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1.5, marginBottom: 12 }}>// RECOMMENDATIONS</Text>
        {(result.suggestions || []).map((s: string, i: number) => (
          <Text key={i} style={{ color: C.tx2, fontSize: 13, marginBottom: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: C.b }}>▸ {s}</Text>
        ))}
        {result.recommendations ? <Text style={{ color: C.tx2, fontSize: 13, lineHeight: 20, marginTop: 6 }}>{result.recommendations}</Text> : null}
      </View>

      <PrimaryBtn label={`◈ ${lang === 'fr' ? 'Nouvelle analyse' : 'New Analysis'}`} onPress={() => setResult(null)} color={C.g} style={{ marginBottom: 24 }} />
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={{ color: C.tx, fontSize: 22, fontWeight: '800', marginBottom: 14 }}>ATS <Text style={{ color: C.g }}>Check</Text></Text>

        <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
          <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1.5, marginBottom: 10 }}>{lang === 'fr' ? '// VOTRE CV' : '// YOUR CV'}</Text>
          <Field val={cv} onChange={setCv} placeholder={lang === 'fr' ? 'Collez votre CV ici...' : 'Paste your CV here...'} multiline C={C} />
        </View>

        <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
          <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1.5, marginBottom: 10 }}>{lang === 'fr' ? '// POSTE' : '// JOB'}</Text>
          <View style={{ marginBottom: 8 }}>
            <Field val={jobTitle} onChange={setJobTitle} placeholder={lang === 'fr' ? 'Intitulé du poste...' : 'Job title...'} C={C} />
          </View>
          <View style={{ marginBottom: 8 }}>
            <Field val={company} onChange={setCompany} placeholder={lang === 'fr' ? 'Entreprise...' : 'Company...'} C={C} />
          </View>
          <Field val={desc} onChange={setDesc} placeholder={lang === 'fr' ? 'Description du poste...' : 'Job description...'} multiline C={C} />
        </View>

        {loading
          ? <View style={{ alignItems: 'center', padding: 24 }}><ActivityIndicator color={C.g} size="large" /></View>
          : <PrimaryBtn label={`◈ ${lang === 'fr' ? 'Analyser' : 'Analyze CV'}`} onPress={analyze} color={C.g} />}
        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── JOBS ─────────────────────────────────────────────────────────────────────
function JobsScreen({ C, lang, jobs, setJobs }: any) {
  const [modal, setModal] = useState(false);
  const [role, setRole] = useState('');
  const [co, setCo] = useState('');
  const [status, setStatus] = useState<JobStatus>('saved');
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');

  const SL: Record<JobStatus, string> = { saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer ✓', rejected: 'Rejected' };
  const SC: Record<JobStatus, string> = { saved: '#4d9fff', applied: '#a855f7', interview: '#00ffaa', offer: '#00ffaa', rejected: '#ff4d6d' };

  const addJob = () => {
    if (!role.trim() || !co.trim()) { Alert.alert('⚠️', 'Role and company required'); return; }
    setJobs((p: Job[]) => [...p, { id: Date.now(), role, company: co, status, ats: null, deadline, notes }]);
    setRole(''); setCo(''); setDeadline(''); setNotes(''); setStatus('saved'); setModal(false);
  };
  const cycleStatus = (id: number) => setJobs((p: Job[]) => p.map((j: Job) => j.id === id ? { ...j, status: STATUS_ALL[(STATUS_ALL.indexOf(j.status) + 1) % STATUS_ALL.length] } : j));
  const deleteJob = (id: number) => Alert.alert(lang === 'fr' ? 'Supprimer?' : 'Delete?', '', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => setJobs((p: Job[]) => p.filter((j: Job) => j.id !== id)) }]);
  const stats: Record<string, number> = jobs.reduce((a: any, j: Job) => ({ ...a, [j.status]: (a[j.status] || 0) + 1 }), {});

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: C.tx, fontSize: 22, fontWeight: '800' }}>Job <Text style={{ color: C.g }}>Tracker</Text></Text>
          <TouchableOpacity onPress={() => setModal(true)} style={{ backgroundColor: C.g, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: '#000', fontWeight: '700', fontSize: 13 }}>+ {lang === 'fr' ? 'Ajouter' : 'Add'}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
          {(['applied', 'interview', 'offer', 'rejected'] as JobStatus[]).map((st, i) => (
            <View key={st} style={{
              width: (SW - 42) / 2, marginRight: i % 2 === 0 ? 10 : 0, marginBottom: 10,
              backgroundColor: C.card, borderRadius: 12, padding: 12,
              borderWidth: 1, borderColor: C.border, overflow: 'hidden',
            }}>
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: SC[st] }} />
              <Text style={{ color: SC[st], fontSize: 24, fontWeight: '800' }}>{stats[st] || 0}</Text>
              <Text style={{ color: C.tx3, fontSize: 11, marginTop: 3 }}>{SL[st]}</Text>
            </View>
          ))}
        </View>

        {jobs.map((j: Job) => (
          <View key={j.id} style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ color: C.tx, fontSize: 15, fontWeight: '700' }}>{j.role}</Text>
                <Text style={{ color: C.tx2, fontSize: 12, marginTop: 2 }}>{j.company}</Text>
              </View>
              <View style={{ backgroundColor: SC[j.status] + '22', borderRadius: 20, borderWidth: 1, borderColor: SC[j.status] + '55', paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: SC[j.status], fontSize: 10, fontWeight: '700' }}>{SL[j.status]}</Text>
              </View>
            </View>
            {j.deadline ? <Text style={{ color: C.tx3, fontSize: 11, marginBottom: 6 }}>📅 {j.deadline}{daysUntil(j.deadline) >= 0 ? ` · ${daysUntil(j.deadline)}d` : ''}</Text> : null}
            {j.ats != null ? <Text style={{ color: scoreColor(j.ats, C), fontSize: 11, marginBottom: 6 }}>{j.ats}% ATS</Text> : null}
            {j.notes ? <Text style={{ color: C.tx3, fontSize: 12, marginBottom: 8 }}>{j.notes}</Text> : null}
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={() => cycleStatus(j.id)} style={{ flex: 1, marginRight: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingVertical: 8, alignItems: 'center' }}>
                <Text style={{ color: C.tx2, fontSize: 12, fontWeight: '600' }}>⟳ {SL[j.status]}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteJob(j.id)} style={{ borderRadius: 8, borderWidth: 1, borderColor: C.r + '44', backgroundColor: C.r + '14', paddingHorizontal: 16, paddingVertical: 8 }}>
                <Text style={{ color: C.r, fontSize: 12, fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: C.card, padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ color: C.tx, fontSize: 20, fontWeight: '800' }}>{lang === 'fr' ? 'Ajouter' : 'Add Application'}</Text>
            <TouchableOpacity onPress={() => setModal(false)}>
              <Text style={{ color: C.tx3, fontSize: 22 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ marginBottom: 10 }}><Field val={role} onChange={setRole} placeholder="Role..." C={C} /></View>
            <View style={{ marginBottom: 10 }}><Field val={co} onChange={setCo} placeholder="Company..." C={C} /></View>
            <View style={{ marginBottom: 10 }}><Field val={deadline} onChange={setDeadline} placeholder="Deadline (YYYY-MM-DD)" C={C} /></View>
            <View style={{ marginBottom: 16 }}><Field val={notes} onChange={setNotes} placeholder="Notes..." C={C} /></View>
            <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1.5, marginBottom: 8 }}>STATUS</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 }}>
              {STATUS_ALL.map(st => (
                <TouchableOpacity key={st} onPress={() => setStatus(st)}
                  style={{ borderRadius: 20, borderWidth: 1, borderColor: status === st ? C.g : C.border, backgroundColor: status === st ? C.g + '22' : 'transparent', paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8 }}>
                  <Text style={{ color: status === st ? C.g : C.tx3, fontSize: 12, fontWeight: '600' }}>{st}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <PrimaryBtn label={lang === 'fr' ? 'Sauvegarder' : 'Save'} onPress={addJob} color={C.g} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── INTERVIEW ────────────────────────────────────────────────────────────────
function InterviewScreen({ C, lang }: any) {
  const [subtab, setSubtab] = useState<'practice' | 'bank'>('practice');
  const [bankTab, setBankTab] = useState<keyof typeof QBANK>('technical');
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('setup');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [mode, setMode] = useState<IVMode>('mixed');
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [qNum, setQNum] = useState(0);
  const [report, setReport] = useState<any>(null);
  const [speaking, setSpeaking] = useState(false);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recRef = useRef<Audio.Recording | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const TOTAL = 6;

  const speak = useCallback((text: string) => {
    try {
      Speech.stop(); setSpeaking(true);
      Speech.speak(text, {
        language: lang === 'fr' ? 'fr-FR' : 'en-US',
        rate: 0.92,
        onDone: () => setSpeaking(false),
        onError: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
      });
    } catch { setSpeaking(false); }
  }, [lang]);

  const stopSpeak = useCallback(() => { Speech.stop(); setSpeaking(false); }, []);
  const scrollBottom = useCallback(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150); }, []);

  const SYS = `You are a senior recruiter interviewing for ${role || 'an AI/ML intern role'}${company ? ` at ${company}` : ''}. Mode: ${mode}. Respond in ${lang === 'fr' ? 'French' : 'English'}.

RULES: Act like a REAL interviewer. Give yourself a short name. React naturally with short acknowledgments like "I see.", "Interesting.", "Can you elaborate?". NEVER give scores, ratings, or coaching feedback during the interview. Push back on vague answers: "Can you be more specific?" No bullet points, no lists — speak conversationally.`;

  const startInterview = async () => {
    if (!role.trim()) { Alert.alert('⚠️', lang === 'fr' ? 'Entrez le poste cible' : 'Enter a target role'); return; }
    setLoading(true); setHistory([]); setQNum(1); setReport(null); setInput(''); setTranscript('');
    try {
      const reply = await ai([
        { role: 'system', content: SYS },
        { role: 'user', content: `Start the interview. Introduce yourself in 1 sentence with a name and title. Then ask question 1 of ${TOTAL} naturally. Be conversational, no lists.` },
      ], false, 220);
      setHistory([{ role: 'assistant', content: reply }]);
      setPhase('active');
      scrollBottom();
      speak(reply);
    } catch (e) { Alert.alert('Error', String(e)); }
    setLoading(false);
  };

  const sendAnswer = async () => {
    const ans = input.trim();
    if (!ans) return;
    stopSpeak();
    const newH: Msg[] = [...history, { role: 'user', content: ans }];
    setHistory(newH); setInput(''); setTranscript(''); setLoading(true); scrollBottom();
    try {
      const isLast = qNum >= TOTAL;
      const reply = await ai([
        { role: 'system', content: SYS },
        ...newH,
        { role: 'user', content: isLast
            ? `This was question ${TOTAL}/${TOTAL}. The candidate just answered. Wrap up the interview naturally — thank them, say you'll be in touch, give a professional goodbye. Do NOT give any scores or feedback.`
            : `Question ${qNum}/${TOTAL} just answered. React in 1 natural sentence (NOT "Great answer!" — something like "I see." or "Interesting." or push back if vague). Then either ask a natural follow-up if the answer needs more depth, OR move to question ${qNum + 1}/${TOTAL}.` },
      ], false, 220);
      const finalH: Msg[] = [...newH, { role: 'assistant', content: reply }];
      setHistory(finalH); speak(reply); scrollBottom();
      if (isLast) {
        setPhase('complete');
        try {
          const raw = await ai([
            { role: 'system', content: SYS },
            ...finalH,
            { role: 'user', content: `The interview is over. Generate a comprehensive honest debrief. Return ONLY valid JSON:\n{"overall_score":72,"grade":"B+","verdict":"Solid candidate","category_scores":{"communication":75,"technical":70,"problem_solving":65,"confidence":80},"top_strengths":["strength 1","strength 2"],"priority_improvements":["improvement 1","improvement 2"],"hiring_recommendation":"Would recommend for next round","coaching_summary":"Write 2-3 paragraphs of honest coaching advice referencing specific moments from the interview."}` },
          ], true, 900);
          setReport(JSON.parse(raw));
        } catch { setReport({ overall_score: 70, grade: 'B', verdict: 'Good effort', top_strengths: [], priority_improvements: [], coaching_summary: 'Could not generate debrief.' }); }
      } else {
        const isFollowUp = !reply.match(/question\s*\d|next|let'?s\s+(move|talk|discuss)|moving on/i);
        if (!isFollowUp) setQNum((n: number) => n + 1);
      }
    } catch (e) { Alert.alert('Error', String(e)); }
    setLoading(false);
  };

  const startRecording = async () => {
    try {
      Speech.stop(); setSpeaking(false);
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Permission needed', 'Microphone access required for voice input.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recRef.current = rec; setRecording(true); setTranscript('🎤 Recording...');
    } catch (e) { Alert.alert('Recording error', String(e)); }
  };

  const stopRecording = async () => {
    if (!recRef.current) return;
    setRecording(false); setTranscript('⏳ Transcribing...');
    try {
      await recRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recRef.current.getURI();
      recRef.current = null;
      if (!uri) { setTranscript(''); return; }
      const form = new FormData();
      form.append('file', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);
      form.append('model', 'whisper-large-v3');
      form.append('language', lang === 'fr' ? 'fr' : 'en');
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: form,
      });
      if (!res.ok) throw new Error(`Whisper ${res.status}`);
      const data = await res.json();
      const t = data.text?.trim() || '';
      if (t) { setTranscript(t); setInput(t); }
      else { setTranscript(''); Alert.alert('No speech detected', 'Try speaking more clearly.'); }
    } catch (e) { setTranscript(''); Alert.alert('Transcription error', String(e)); }
  };

  const reset = () => { stopSpeak(); setPhase('setup'); setHistory([]); setQNum(0); setReport(null); setInput(''); setTranscript(''); setRecording(false); };

  const SetupView = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: C.g + '18', borderWidth: 2, borderColor: C.g + '66', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 32 }}>🤖</Text>
        </View>
        <Text style={{ color: C.tx, fontSize: 17, fontWeight: '800' }}>
          {lang === 'fr' ? 'Votre Intervieweur IA' : 'Your AI Interviewer'}
        </Text>
        <Text style={{ color: C.tx3, fontSize: 12, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
          {lang === 'fr' ? `${TOTAL} questions · Vraie conversation · Voix native` : `${TOTAL} questions · Real conversation · Native voice · Debrief at end`}
        </Text>
      </View>

      <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 14 }}>
        <View style={{ marginBottom: 10 }}>
          <Field val={role} onChange={setRole} placeholder={lang === 'fr' ? 'Poste cible (ex: ML Engineer)' : 'Target role (e.g. ML Engineer Intern)'} C={C} />
        </View>
        <View style={{ marginBottom: 12 }}>
          <Field val={company} onChange={setCompany} placeholder={lang === 'fr' ? 'Entreprise (optionnel)' : 'Company (optional)'} C={C} />
        </View>
        <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1.5, marginBottom: 8 }}>MODE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {([{ v: 'mixed', l: 'Mixed' }, { v: 'technical', l: 'Technical' }, { v: 'behavioral', l: 'Behavioral' }, { v: 'ml_deep', l: 'Deep ML' }] as { v: IVMode; l: string }[]).map(m => (
            <TouchableOpacity key={m.v} onPress={() => setMode(m.v)}
              style={{ borderRadius: 20, borderWidth: 1, borderColor: mode === m.v ? C.g : C.border, backgroundColor: mode === m.v ? C.g + '22' : 'transparent', paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8 }}>
              <Text style={{ color: mode === m.v ? C.g : C.tx3, fontSize: 12, fontWeight: '700' }}>{m.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading
        ? <View style={{ alignItems: 'center', padding: 16 }}><ActivityIndicator color={C.g} size="large" /></View>
        : <PrimaryBtn label={`🎤 ${lang === 'fr' ? "Démarrer l'entretien" : 'Start Interview'}`} onPress={startInterview} color={C.g} />}
      <View style={{ height: 24 }} />
    </ScrollView>
  );

  const ActiveView = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={140}>
      {/* Session bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.card }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.g + '18', borderWidth: 1.5, borderColor: speaking ? C.g : C.border, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <Text style={{ fontSize: 16 }}>{speaking ? '🔊' : '🤖'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.tx, fontSize: 13, fontWeight: '700' }}>{role}{company ? ` @ ${company}` : ''}</Text>
          <Text style={{ color: speaking ? C.g : C.tx3, fontSize: 11 }}>
            {speaking ? '● Speaking...' : `Q${qNum}/${TOTAL} · ${mode}`}
          </Text>
        </View>
        {speaking && (
          <TouchableOpacity onPress={stopSpeak} style={{ backgroundColor: C.r + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginRight: 8 }}>
            <Text style={{ color: C.r, fontSize: 12 }}>⏹</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={reset} style={{ backgroundColor: C.r + '18', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: C.r, fontSize: 12, fontWeight: '700' }}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, backgroundColor: C.card }}>
        <ProgressBar val={(qNum / TOTAL) * 100} color={C.g} />
      </View>

      {/* Chat */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }} showsVerticalScrollIndicator={false}>
        {history.map((m: Msg, i: number) => (
          <View key={i} style={{ marginBottom: 14, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <Text style={{ color: C.tx3, fontSize: 10, marginBottom: 4, paddingHorizontal: 4 }}>
              {m.role === 'user' ? (lang === 'fr' ? 'Vous' : 'You') : 'Interviewer'}
            </Text>
            <View style={{
              maxWidth: '86%', padding: 12, borderWidth: 1,
              borderRadius: 16,
              borderTopRightRadius: m.role === 'user' ? 4 : 16,
              borderTopLeftRadius: m.role === 'user' ? 16 : 4,
              backgroundColor: m.role === 'user' ? C.b + '22' : C.card,
              borderColor: m.role === 'user' ? C.b + '44' : C.border,
            }}>
              <Text style={{ color: C.tx2, fontSize: 14, lineHeight: 22 }}>{m.content}</Text>
            </View>
          </View>
        ))}
        {loading && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.g + '18', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Text style={{ fontSize: 14 }}>🤖</Text>
            </View>
            <ActivityIndicator color={C.g} />
          </View>
        )}
      </ScrollView>

      {/* Input */}
      {!loading && (
        <View style={{ borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card, padding: 10 }}>
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            {[{ v: 'text', l: '⌨️ Type' }, { v: 'voice', l: '🎤 Voice' }].map(m => (
              <TouchableOpacity key={m.v} onPress={() => { setInputMode(m.v as any); setTranscript(''); }}
                style={{ borderRadius: 20, borderWidth: 1, borderColor: inputMode === m.v ? C.g : C.border, backgroundColor: inputMode === m.v ? C.g + '22' : 'transparent', paddingHorizontal: 14, paddingVertical: 5, marginRight: 8 }}>
                <Text style={{ color: inputMode === m.v ? C.g : C.tx3, fontSize: 12, fontWeight: '700' }}>{m.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {inputMode === 'text' ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <TextInput value={input} onChangeText={setInput}
                placeholder={lang === 'fr' ? 'Votre réponse...' : 'Your answer...'}
                placeholderTextColor={C.tx3} multiline
                style={{ flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: C.tx, fontSize: 14, maxHeight: 100, marginRight: 8 }} />
              <TouchableOpacity onPress={sendAnswer} disabled={!input.trim()}
                style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: input.trim() ? C.g : C.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20, color: input.trim() ? '#000' : C.tx3 }}>↑</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity onPress={recording ? stopRecording : startRecording}
                style={{ width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: recording ? C.r : C.g, backgroundColor: recording ? C.r + '22' : C.g + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 28 }}>{recording ? '⏹' : '🎤'}</Text>
              </TouchableOpacity>
              <Text style={{ color: recording ? C.r : C.tx3, fontSize: 12, fontWeight: '600', marginBottom: transcript ? 8 : 0 }}>
                {recording ? '● Recording — tap to stop' : 'Tap mic to record your answer'}
              </Text>
              {transcript ? (
                <View style={{ backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10, width: '100%', marginBottom: 8 }}>
                  <Text style={{ color: C.tx2, fontSize: 13, lineHeight: 20 }}>{transcript}</Text>
                </View>
              ) : null}
              {input.trim() && !recording ? (
                <PrimaryBtn label="↑ Send Answer" onPress={() => { sendAnswer(); setTranscript(''); }} color={C.g} style={{ width: '100%' }} />
              ) : null}
            </View>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );

  const CompleteView = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
      <Text style={{ color: C.tx, fontSize: 22, fontWeight: '800', marginBottom: 14 }}>🏁 <Text style={{ color: C.g }}>Debrief</Text></Text>
      {!report ? (
        <View style={{ alignItems: 'center', padding: 48 }}>
          <ActivityIndicator color={C.g} size="large" />
          <Text style={{ color: C.tx3, marginTop: 16, fontSize: 13 }}>
            {lang === 'fr' ? 'Génération du rapport...' : 'Generating your debrief...'}
          </Text>
        </View>
      ) : (
        <>
          <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: scoreColor(report.overall_score || 70, C), fontSize: 56, fontWeight: '800' }}>{report.grade || 'B'}</Text>
            <Text style={{ color: C.tx, fontSize: 20, fontWeight: '700', marginTop: 4 }}>{report.overall_score || 70}%</Text>
            <Text style={{ color: C.tx3, fontSize: 13, marginTop: 6, textAlign: 'center' }}>{report.verdict || ''}</Text>
          </View>

          {report.category_scores && (
            <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
              <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1.5, marginBottom: 12 }}>SCORES</Text>
              {Object.entries(report.category_scores as Record<string, number>).map(([k, v]) => (
                <View key={k} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: C.tx2, fontSize: 12, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</Text>
                    <Text style={{ color: C.tx2, fontSize: 12 }}>{v}%</Text>
                  </View>
                  <ProgressBar val={v} color={scoreColor(v, C)} />
                </View>
              ))}
            </View>
          )}

          <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ color: C.g, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>✓ STRENGTHS</Text>
                {(report.top_strengths || []).map((s: string, i: number) => (
                  <Text key={i} style={{ color: C.tx2, fontSize: 12, marginBottom: 5, lineHeight: 18 }}>• {s}</Text>
                ))}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.o, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>▲ IMPROVE</Text>
                {(report.priority_improvements || []).map((s: string, i: number) => (
                  <Text key={i} style={{ color: C.tx2, fontSize: 12, marginBottom: 5, lineHeight: 18 }}>• {s}</Text>
                ))}
              </View>
            </View>
          </View>

          {report.coaching_summary ? (
            <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.b, marginBottom: 12 }}>
              <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>COACHING</Text>
              <Text style={{ color: C.tx2, fontSize: 13, lineHeight: 22 }}>{report.coaching_summary}</Text>
            </View>
          ) : null}

          {report.hiring_recommendation ? (
            <View style={{ backgroundColor: C.g + '12', borderRadius: 12, borderWidth: 1, borderColor: C.g + '33', padding: 12, marginBottom: 20 }}>
              <Text style={{ color: C.g, fontSize: 13, fontWeight: '600' }}>🎯 {report.hiring_recommendation}</Text>
            </View>
          ) : null}

          <PrimaryBtn label={lang === 'fr' ? '↺ Nouvel entretien' : '↺ New Interview'} onPress={reset} color={C.g} style={{ marginBottom: 32 }} />
        </>
      )}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Sub-tabs */}
      <View style={{ flexDirection: 'row', padding: 12, paddingBottom: 4, backgroundColor: C.bg }}>
        {[{ v: 'practice', l: '🎤 Interview' }, { v: 'bank', l: '📚 Q Bank' }].map(t => (
          <TouchableOpacity key={t.v} onPress={() => setSubtab(t.v as any)}
            style={{ borderRadius: 20, borderWidth: 1, borderColor: subtab === t.v ? C.g : C.border, backgroundColor: subtab === t.v ? C.g + '22' : 'transparent', paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 }}>
            <Text style={{ color: subtab === t.v ? C.g : C.tx3, fontSize: 13, fontWeight: '700' }}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {subtab === 'practice' ? (
        <>
          {phase === 'setup' && <SetupView />}
          {phase === 'active' && <ActiveView />}
          {phase === 'complete' && <CompleteView />}
        </>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, paddingHorizontal: 12, paddingVertical: 8 }}>
            {(['technical', 'behavioral', 'ml'] as const).map(t => (
              <TouchableOpacity key={t} onPress={() => setBankTab(t)}
                style={{ borderRadius: 20, borderWidth: 1, borderColor: bankTab === t ? C.b : C.border, backgroundColor: bankTab === t ? C.b + '22' : 'transparent', paddingHorizontal: 14, paddingVertical: 6, marginRight: 8 }}>
                <Text style={{ color: bankTab === t ? C.b : C.tx3, fontSize: 12, fontWeight: '700' }}>
                  {t === 'technical' ? 'Technical' : t === 'behavioral' ? 'Behavioral' : 'ML / AI'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FlatList
            data={QBANK[bankTab]}
            keyExtractor={(_: any, i: number) => String(i)}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item, index }: { item: { q: string; a: string }; index: number }) => (
              <TouchableOpacity onPress={() => setExpandedQ(expandedQ === index ? null : index)}
                style={{ backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: expandedQ === index ? C.b : C.border, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={{ color: C.tx, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8, lineHeight: 20 }}>{item.q}</Text>
                  <Text style={{ color: C.tx3, fontSize: 12 }}>{expandedQ === index ? '▴' : '▾'}</Text>
                </View>
                {expandedQ === index && (
                  <Text style={{ color: C.tx2, fontSize: 13, lineHeight: 21, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>{item.a}</Text>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

// ─── STUDY ────────────────────────────────────────────────────────────────────
function StudyScreen({ C, lang, topics, setTopics }: any) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const COLS = [DARK.g, DARK.b, DARK.o, DARK.p, '#ff6b9d', '#00d4ff'];

  const explain = async (q?: string) => {
    const topic = q || query;
    if (!topic.trim()) return;
    if (q) setQuery(q);
    setLoading(true); setResult('');
    try {
      const r = await ai([
        { role: 'system', content: `Expert AI/ML tutor. Explain clearly for engineering students. Respond in ${lang === 'fr' ? 'French' : 'English'}.` },
        { role: 'user', content: `Explain "${topic}" for an AI engineering student preparing for internship interviews. Cover overview, key concepts, and interview tips.` },
      ], false, 600);
      setResult(r);
    } catch (e) { Alert.alert('Error', String(e)); }
    setLoading(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: C.tx, fontSize: 22, fontWeight: '800' }}>Study <Text style={{ color: C.g }}>Hub</Text></Text>
          <TouchableOpacity onPress={() => setModal(true)} style={{ backgroundColor: C.g, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: '#000', fontWeight: '700', fontSize: 13 }}>+ Topic</Text>
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 14 }}>
          <View style={{ marginBottom: 10 }}>
            <Field val={query} onChange={setQuery} placeholder="Transformer, Backprop, RL, BERT..." C={C} />
          </View>
          {loading
            ? <View style={{ alignItems: 'center', padding: 12 }}><ActivityIndicator color={C.b} /></View>
            : <PrimaryBtn label={`📖 ${lang === 'fr' ? 'Expliquer' : 'Explain'}`} onPress={() => explain()} color={C.b} textColor="#fff" />}
          {result ? (
            <View style={{ marginTop: 12, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12 }}>
              <Text style={{ color: C.tx2, fontSize: 13, lineHeight: 22 }}>{result}</Text>
            </View>
          ) : null}
        </View>

        {topics.map((tp: Topic, i: number) => (
          <View key={tp.id} style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: C.tx, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 }}>{tp.name}</Text>
              <Text style={{ color: COLS[i % COLS.length], fontSize: 13, fontWeight: '700' }}>{tp.progress}%</Text>
            </View>
            <Text style={{ color: C.tx3, fontSize: 12, marginBottom: 8 }}>{tp.desc}</Text>
            <View style={{ marginBottom: 10 }}><ProgressBar val={tp.progress} color={COLS[i % COLS.length]} /></View>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={() => explain(tp.name)} style={{ flex: 1, marginRight: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingVertical: 8, alignItems: 'center' }}>
                <Text style={{ color: C.tx2, fontSize: 12, fontWeight: '600' }}>📖 Explain</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTopics((p: Topic[]) => p.map((t: Topic) => t.id === tp.id ? { ...t, progress: Math.min(100, t.progress + 10) } : t))}
                style={{ marginRight: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: C.tx2, fontSize: 12, fontWeight: '600' }}>+10%</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTopics((p: Topic[]) => p.filter((t: Topic) => t.id !== tp.id))}
                style={{ borderRadius: 8, borderWidth: 1, borderColor: C.r + '44', backgroundColor: C.r + '14', paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: C.r, fontSize: 12 }}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: C.card, padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={{ color: C.tx, fontSize: 20, fontWeight: '800' }}>Add Topic</Text>
            <TouchableOpacity onPress={() => setModal(false)}><Text style={{ color: C.tx3, fontSize: 22 }}>✕</Text></TouchableOpacity>
          </View>
          <View style={{ marginBottom: 10 }}><Field val={name} onChange={setName} placeholder="Topic name..." C={C} /></View>
          <View style={{ marginBottom: 20 }}><Field val={desc} onChange={setDesc} placeholder="Description..." C={C} /></View>
          <PrimaryBtn label="Save" onPress={() => {
            if (!name.trim()) return;
            setTopics((p: Topic[]) => [...p, { id: Date.now(), name, desc, progress: 0 }]);
            setName(''); setDesc(''); setModal(false);
          }} color={C.g} />
        </View>
      </Modal>
    </View>
  );
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
function SearchScreen({ C, lang }: any) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const QUICK = [
    'ML engineer salary France 2025',
    'AI internship Paris 2025',
    'Thales AI division culture',
    'Required skills AI engineer France',
    'MLOps France jobs 2025',
  ];

  const search = async (q?: string) => {
    const sq = q || query;
    if (!sq.trim()) return;
    if (q) setQuery(q);
    setLoading(true); setResult('');
    try {
      const r = await ai([
        { role: 'system', content: `Career research assistant for French AI/tech jobs. Give concise, actionable insights. Respond in ${lang === 'fr' ? 'French' : 'English'}.` },
        { role: 'user', content: `Research for French AI engineering student: "${sq}". Provide: current market context, typical requirements, salary ranges if relevant, and 2-3 concrete actionable tips. Be specific for 2025-2026.` },
      ], false, 500);
      setResult(r);
    } catch (e) { Alert.alert('Error', String(e)); }
    setLoading(false);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={{ color: C.tx, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>Market <Text style={{ color: C.g }}>Research</Text></Text>
      <Text style={{ color: C.tx3, fontSize: 12, marginBottom: 14 }}>
        {lang === 'fr' ? 'Intelligence marché IA' : 'AI-powered market intelligence'}
      </Text>

      <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 14 }}>
        <View style={{ marginBottom: 10 }}>
          <Field val={query} onChange={setQuery} placeholder={lang === 'fr' ? 'Entreprise, salaire, compétences...' : 'Company, salary, required skills...'} C={C} />
        </View>
        {loading
          ? <View style={{ alignItems: 'center', padding: 12 }}><ActivityIndicator color={C.g} /></View>
          : <PrimaryBtn label={`⌕ ${lang === 'fr' ? 'Rechercher' : 'Search'}`} onPress={() => search()} color={C.g} />}
      </View>

      <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1.5, marginBottom: 8 }}>// QUICK SEARCHES</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
        {QUICK.map(q => (
          <TouchableOpacity key={q} onPress={() => search(q)}
            style={{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 5, marginRight: 8, marginBottom: 8 }}>
            <Text style={{ color: C.tx2, fontSize: 11 }}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {result ? (
        <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ color: C.tx3, fontSize: 10, letterSpacing: 1.5, marginBottom: 10 }}>⚡ AI RESEARCH</Text>
          <Text style={{ color: C.tx2, fontSize: 14, lineHeight: 23 }}>{result}</Text>
        </View>
      ) : null}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}