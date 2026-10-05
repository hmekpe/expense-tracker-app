import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet, Platform, BackHandler } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { StatusBar } from 'expo-status-bar';

const KEY = 'expenses.v1';
const THEME_KEY = 'expenses.theme.v1';
const BUDGET_KEY = 'expenses.budget.v1';
const CURRENCY = 'GH₵';          // shown in the app; change to '$' etc. if you like
const PDF_CURRENCY = 'GHS';      // shown in the PDF report (a code prints reliably on every phone)
const LARGE_AMOUNT = 50000;      // amounts at or above this show an extra warning
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const CATEGORIES = [
  { name: 'Food', color: '#5BC8A8' },
  { name: 'Transport', color: '#6EA8FE' },
  { name: 'Bills', color: '#F59E7B' },
  { name: 'Shopping', color: '#B79CED' },
  { name: 'Other', color: '#8FA0BE' },
];
const colorOf = (n) => (CATEGORIES.find((c) => c.name === n) || CATEGORIES[4]).color;

const THEMES = {
  dark: {
    bg: '#05080F', card: '#101B30', cardBorder: 'rgba(212,175,55,0.24)', input: '#0A1222', inputBorder: '#2A3B5C',
    text: '#F4EFE3', muted: '#8FA0BE', gold: '#D4AF37', goldText: '#E8CF7A', onGold: '#0B1220',
    danger: '#FF8A80', onDanger: '#0B1220', amber: '#F5A623', track: '#1F2E4D', tab: '#08101D',
    barDim: 'rgba(212,175,55,0.38)', overlay: 'rgba(0,0,0,0.72)',
  },
  light: {
    bg: '#F5F1E8', card: '#FFFFFF', cardBorder: 'rgba(154,123,28,0.30)', input: '#FBF8F1', inputBorder: '#D9CFB8',
    text: '#0E1A2E', muted: '#566380', gold: '#C9A227', goldText: '#7A5C08', onGold: '#0B1220',
    danger: '#B3261E', onDanger: '#FFFFFF', amber: '#B26A00', track: '#E6DFCC', tab: '#FFFFFF',
    barDim: 'rgba(201,162,39,0.45)', overlay: 'rgba(10,18,32,0.55)',
  },
};

const fmtNum = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => `${CURRENCY} ${fmtNum(n)}`;
const pdfMoney = (n) => `${PDF_CURRENCY} ${fmtNum(n)}`;
const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));

const parseAmount = (raw) => {
  let s = raw.trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, ''); // 1,000.50
  else s = s.replace(',', '.');                                    // 1,5
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dateFor = (offset) => { const d = new Date(); d.setDate(d.getDate() - offset); return d.getTime(); };
const shortDate = (ts) => new Date(ts).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const fullDate = (ts) => new Date(ts).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const monthLong = (ts) => new Date(ts).toLocaleDateString([], { month: 'long' });
const dayLabel = (ts) => {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return shortDate(ts);
};
const timeLabel = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const sameMonth = (ts, base) => { const d = new Date(ts); return d.getMonth() === base.getMonth() && d.getFullYear() === base.getFullYear(); };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- PDF report (HTML rendered to PDF by expo-print) ----------
function buildReportHtml({ label, scoped, total, list, avg, biggest, budget, change }) {
  const rows = [...scoped].sort((a, b) => b.date - a.date).map((it, i) =>
    `<tr class="${i % 2 ? 'alt' : ''}"><td>${esc(fullDate(it.date))}</td>` +
    `<td><span class="dot" style="background:${colorOf(it.category)}"></span>${esc(it.category)}</td>` +
    `<td>${esc(it.note || '')}</td><td class="amt">${pdfMoney(it.amount)}</td></tr>`).join('');
  const cats = list.map((r) =>
    `<div class="crow"><div class="chead"><span><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</span>` +
    `<span>${pdfMoney(r.sum)} &nbsp;(${Math.round(r.pct * 100)}%)</span></div>` +
    `<div class="track"><div class="fill" style="width:${Math.max(r.pct * 100, 2)}%;background:${r.color}"></div></div></div>`).join('');
  const budgetHtml = budget > 0
    ? `<div class="tile"><div class="tl">Monthly budget</div><div class="tv">${pdfMoney(budget)}</div><div class="ts">${total <= budget ? pdfMoney(budget - total) + ' left' : 'Over by ' + pdfMoney(total - budget)}</div></div>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:Helvetica,Arial,sans-serif;color:#0E1A2E;margin:0;padding:0}
  .head{background:#0A1226;color:#F4EFE3;padding:34px 36px 26px;border-bottom:5px solid #D4AF37}
  .eyebrow{color:#E8CF7A;letter-spacing:3px;font-size:11px;font-weight:bold}
  h1{font-family:Georgia,'Times New Roman',serif;font-size:34px;margin:8px 0 4px}
  .sub{color:#B9C4D9;font-size:14px}
  .wrap{padding:26px 36px}
  .tiles{display:flex;margin:0 -6px 8px}
  .tile{flex:1;margin:0 6px;border:1px solid #E3D6A8;border-top:4px solid #D4AF37;border-radius:10px;padding:14px;background:#FBF8EE}
  .tl{font-size:11px;color:#566380;letter-spacing:1px;text-transform:uppercase}
  .tv{font-family:Georgia,serif;font-size:21px;font-weight:bold;margin-top:6px;color:#0A1226}
  .ts{font-size:12px;color:#566380;margin-top:4px}
  h2{font-family:Georgia,serif;font-size:19px;margin:26px 0 12px;color:#0A1226;border-bottom:2px solid #D4AF37;padding-bottom:6px}
  .crow{margin-bottom:14px}.chead{display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px}
  .track{height:10px;background:#E8E4D6;border-radius:5px;overflow:hidden}.fill{height:10px;border-radius:5px}
  .dot{display:inline-block;width:9px;height:9px;border-radius:5px;margin-right:7px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#0A1226;color:#E8CF7A;text-align:left;padding:9px 10px;font-size:11px;letter-spacing:1px;text-transform:uppercase}
  td{padding:9px 10px;border-bottom:1px solid #EEE9D8}tr{page-break-inside:avoid}tr.alt td{background:#FAF8F0}
  .amt{text-align:right;font-weight:bold;white-space:nowrap}th:last-child{text-align:right}
  .foot{margin-top:28px;font-size:11px;color:#8A93A6;text-align:center;border-top:1px solid #E3D6A8;padding-top:12px}
  </style></head><body>
  <div class="head"><div class="eyebrow">EXPENSE REPORT</div><h1>${esc(label)}</h1>
  <div class="sub">${scoped.length} ${scoped.length === 1 ? 'expense' : 'expenses'} recorded</div></div>
  <div class="wrap">
  <div class="tiles">
    <div class="tile"><div class="tl">Total spent</div><div class="tv">${pdfMoney(total)}</div></div>
    <div class="tile"><div class="tl">Daily average</div><div class="tv">${pdfMoney(avg)}</div></div>
    <div class="tile"><div class="tl">Biggest expense</div><div class="tv">${biggest ? pdfMoney(biggest.amount) : '-'}</div><div class="ts">${biggest ? esc(biggest.note || biggest.category) : ''}</div></div>
    ${budgetHtml}
  </div>
  ${change ? `<div class="sub" style="color:#566380;margin-top:10px">Compared with last month: ${esc(change)}</div>` : ''}
  <h2>Spending by category</h2>${cats}
  <h2>All transactions</h2>
  <table><thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="foot">Generated on ${esc(fullDate(Date.now()))} with the Expenses app</div>
  </div></body></html>`;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('add');
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [themeName, setThemeName] = useState('dark');
  const [budget, setBudget] = useState(0);

  // add / edit form
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [note, setNote] = useState('');
  const [dateMode, setDateMode] = useState('today'); // today | yesterday | custom | keep
  const [customDate, setCustomDate] = useState(null);
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  // history
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');

  // summary
  const [range, setRange] = useState('month');
  const [monthOffset, setMonthOffset] = useState(0);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetError, setBudgetError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);

  // feedback
  const [snack, setSnack] = useState(null);
  const [dialog, setDialog] = useState(null);
  const timer = useRef(null);
  const amountRef = useRef(null);

  const t = THEMES[themeName];
  const st = useMemo(() => makeStyles(t), [themeName]);
  const isDark = themeName === 'dark';
  const statusColor = (ratio) => (ratio >= 1 ? t.danger : ratio >= 0.8 ? t.amber : t.gold);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(THEME_KEY), AsyncStorage.getItem(BUDGET_KEY)])
      .then(([raw, th, bg]) => {
        try { if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setItems(parsed); } } catch (e) {}
        if (th === 'light' || th === 'dark') setThemeName(th);
        const b = parseFloat(bg);
        if (Number.isFinite(b) && b > 0) setBudget(b);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    return () => clearTimeout(timer.current);
  }, []);
  useEffect(() => { if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(items)); }, [items, loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem(THEME_KEY, themeName); }, [themeName, loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem(BUDGET_KEY, String(budget)); }, [budget, loaded]);

  // Android back button closes the confirmation instead of leaving the app
  useEffect(() => {
    if (!dialog) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setDialog(null); return true; });
    return () => sub.remove();
  }, [dialog]);

  const showSnack = (message, onUndo) => {
    clearTimeout(timer.current);
    setSnack({ message, onUndo });
    timer.current = setTimeout(() => setSnack(null), 6000);
  };
  const undo = () => {
    if (!snack) return;
    clearTimeout(timer.current);
    snack.onUndo();
    setSnack(null);
  };

  // ----- date handling -----
  const editingItem = items.find((x) => x.id === editingId);
  const effectiveDate = (() => {
    if (dateMode === 'yesterday') return dateFor(1);
    if (dateMode === 'custom' && customDate) {
      const d = new Date(customDate), n = new Date();
      d.setHours(n.getHours(), n.getMinutes(), n.getSeconds(), 0);
      return d.getTime();
    }
    if (dateMode === 'keep' && editingItem) return editingItem.date;
    return Date.now();
  })();
  const diffDays = Math.round((startOfDay(Date.now()) - startOfDay(effectiveDate)) / 86400000);
  const shownChoice = diffDays === 0 ? 'today' : diffDays === 1 ? 'yesterday' : 'custom';

  const pickDate = () => {
    const start = new Date(effectiveDate);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start, mode: 'date', maximumDate: new Date(),
        onChange: (e, d) => {
          if (e.type === 'set' && d) { setCustomDate(d.getTime()); setDateMode('custom'); }
        },
      });
    } else {
      setCustomDate(effectiveDate);
      setDateMode('custom');
      setShowIOSPicker(true);
    }
  };

  // ----- add / edit / delete (all behind a confirmation) -----
  const resetForm = () => {
    setAmount(''); setNote(''); setDateMode('today'); setCustomDate(null);
    setShowIOSPicker(false); setEditingId(null); setError(null);
  };

  const commit = (value, date) => {
    const existing = items.find((x) => x.id === editingId);
    if (existing) {
      const updated = { ...existing, amount: value, category, note: note.trim(), date };
      setItems((prev) => prev.map((x) => (x.id === existing.id ? updated : x)));
      showSnack('Changes saved', () => setItems((prev) => prev.map((x) => (x.id === existing.id ? existing : x))));
    } else {
      const item = { id: Date.now().toString(), amount: value, category, note: note.trim(), date };
      setItems((prev) => [item, ...prev]);
      showSnack('Expense added', () => setItems((prev) => prev.filter((x) => x.id !== item.id)));
    }
    resetForm();
    setFilter('All');
    setQuery('');
    setTab('history');
  };

  const detailLines = (amt, cat, date, nt) => [
    ['Amount', money(amt)], ['Category', cat], ['Date', fullDate(date)], ['Note', nt && nt.trim() ? nt.trim() : 'None'],
  ];

  const trySave = () => {
    const value = parseAmount(amount);
    if (value <= 0) {
      setError('Enter an amount greater than zero, for example 25.50.');
      amountRef.current?.focus?.();
      return;
    }
    if (value > 1e9) {
      setError('That amount is too large. Please check it.');
      amountRef.current?.focus?.();
      return;
    }
    const date = effectiveDate;
    const warnings = [];
    if (value >= LARGE_AMOUNT) warnings.push('This is an unusually large amount. Please check it.');
    if (budget > 0) {
      const base = new Date(date);
      const spent = items.filter((x) => x.id !== editingId && sameMonth(x.date, base)).reduce((a, x) => a + x.amount, 0);
      const after = spent + value;
      if (after > budget) warnings.push(`This puts you over your ${monthLong(date)} budget by ${money(after - budget)}.`);
      else if (after >= budget * 0.8) warnings.push(`After this, you will have used ${Math.round((after / budget) * 100)}% of your ${monthLong(date)} budget.`);
    }
    setDialog({
      title: editingId ? 'Save changes?' : 'Save this expense?',
      message: 'Please check the details before saving.',
      lines: detailLines(value, category, date, note),
      warnings,
      confirmLabel: editingId ? 'Yes, save changes' : 'Yes, save',
      onConfirm: () => commit(value, date),
    });
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setAmount(String(item.amount));
    setCategory(item.category);
    setNote(item.note || '');
    setDateMode('keep');
    setCustomDate(null);
    setShowIOSPicker(false);
    setError(null);
    setTab('add');
  };

  const doRemove = (item) => {
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    if (editingId === item.id) resetForm();
    showSnack('Expense deleted', () => setItems((prev) => [item, ...prev]));
  };
  const remove = (item) =>
    setDialog({
      title: 'Delete this expense?',
      message: 'It will be removed from your history and totals. You can undo right after.',
      lines: detailLines(item.amount, item.category, item.date, item.note),
      warnings: [],
      danger: true,
      confirmLabel: 'Yes, delete',
      onConfirm: () => doRemove(item),
    });

  // ----- budget -----
  const startBudgetEdit = () => { setBudgetInput(budget > 0 ? String(budget) : ''); setBudgetError(null); setEditingBudget(true); };
  const saveBudget = () => {
    const v = parseAmount(budgetInput);
    if (v <= 0) { setBudgetError('Enter a budget greater than zero, for example 2000.'); return; }
    setDialog({
      title: 'Set monthly budget?',
      message: 'You will see how much is left each month.',
      lines: [['Monthly budget', money(v)]],
      warnings: [],
      confirmLabel: 'Yes, set budget',
      onConfirm: () => { setBudget(v); setEditingBudget(false); setBudgetInput(''); setBudgetError(null); },
    });
  };
  const removeBudget = () =>
    setDialog({
      title: 'Remove budget?',
      message: 'Budget tracking will be switched off.',
      lines: [['Current budget', money(budget)]],
      warnings: [],
      danger: true,
      confirmLabel: 'Yes, remove',
      onConfirm: () => { setBudget(0); setEditingBudget(false); setBudgetError(null); },
    });

  // ----- derived data -----
  const sorted = useMemo(() => [...items].sort((a, b) => b.date - a.date), [items]);
  const todayTotal = useMemo(
    () => items.filter((x) => startOfDay(x.date) === startOfDay(Date.now())).reduce((a, x) => a + x.amount, 0), [items]);
  const monthTotal = useMemo(
    () => items.filter((x) => sameMonth(x.date, new Date())).reduce((a, x) => a + x.amount, 0), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((x) => {
      if (filter !== 'All' && x.category !== filter) return false;
      if (!q) return true;
      return (x.note || '').toLowerCase().includes(q) || x.category.toLowerCase().includes(q) || String(x.amount).includes(q.replace(',', '.'));
    });
  }, [sorted, filter, query]);

  const rows = useMemo(() => {
    const out = [];
    let lastKey = null;
    filtered.forEach((it) => {
      const key = startOfDay(it.date);
      if (key !== lastKey) {
        const dayTotal = filtered.filter((x) => startOfDay(x.date) === key).reduce((a, x) => a + x.amount, 0);
        out.push({ id: 'h-' + key, header: true, label: dayLabel(it.date), total: dayTotal });
        lastKey = key;
      }
      out.push(it);
    });
    return out;
  }, [filtered]);

  const monthBase = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + monthOffset, 1);
  }, [monthOffset]);
  const monthName = monthBase.toLocaleDateString([], { month: 'long', year: 'numeric' });

  const summary = useMemo(() => {
    const scoped = items.filter((i) => (range === 'all' ? true : sameMonth(i.date, monthBase)));
    const total = scoped.reduce((a, i) => a + i.amount, 0);
    const list = CATEGORIES.map((c) => {
      const sum = scoped.filter((i) => i.category === c.name).reduce((a, i) => a + i.amount, 0);
      return { ...c, sum, pct: total ? sum / total : 0 };
    }).filter((r) => r.sum > 0).sort((a, b) => b.sum - a.sum);

    let days = 1;
    if (range === 'month') {
      days = monthOffset === 0 ? new Date().getDate() : new Date(monthBase.getFullYear(), monthBase.getMonth() + 1, 0).getDate();
    } else if (scoped.length) {
      const first = Math.min(...scoped.map((x) => x.date));
      days = Math.max(1, Math.round((startOfDay(Date.now()) - startOfDay(first)) / 86400000) + 1);
    }
    const avg = total / days;
    const biggest = scoped.reduce((m, x) => (!m || x.amount > m.amount ? x : m), null);

    let change = null;
    if (range === 'month') {
      const prevBase = new Date(monthBase.getFullYear(), monthBase.getMonth() - 1, 1);
      const prevName = prevBase.toLocaleDateString([], { month: 'long' });
      const prevTotal = items.filter((i) => sameMonth(i.date, prevBase)).reduce((a, i) => a + i.amount, 0);
      if (prevTotal > 0) {
        const pct = Math.round(((total - prevTotal) / prevTotal) * 100);
        change = pct > 0 ? `${pct}% more than ${prevName}` : pct < 0 ? `${Math.abs(pct)}% less than ${prevName}` : `Same as ${prevName}`;
      } else {
        change = `No spending recorded in ${prevName}`;
      }
    }
    return { scoped, total, list, count: scoped.length, avg, biggest, change };
  }, [items, range, monthBase, monthOffset]);

  const week = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = startOfDay(d);
      out.push({
        key, today: i === 0,
        label: d.toLocaleDateString([], { weekday: 'short' }).slice(0, 3),
        sum: items.filter((x) => startOfDay(x.date) === key).reduce((a, x) => a + x.amount, 0),
      });
    }
    const max = Math.max(...out.map((o) => o.sum), 1);
    return { days: out, max, total: out.reduce((a, o) => a + o.sum, 0) };
  }, [items]);

  // ----- PDF export -----
  const exportPdf = async () => {
    if (summary.count === 0 || exporting) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const Print = require('expo-print');
      const Sharing = require('expo-sharing');
      const html = buildReportHtml({
        label: range === 'month' ? monthName : 'All time',
        scoped: summary.scoped, total: summary.total, list: summary.list, avg: summary.avg,
        biggest: summary.biggest, budget: range === 'month' ? budget : 0, change: summary.change,
      });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save or share your expense report', UTI: 'com.adobe.pdf' });
        setExportMsg({ ok: true, text: 'PDF created. Use the share menu to save it or send it.' });
      } else {
        setExportMsg({ ok: false, text: 'Saving is not available on this device.' });
      }
    } catch (e) {
      setExportMsg({ ok: false, text: 'Could not create the PDF. Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  const parsedPreview = parseAmount(amount);
  const isFiltering = filter !== 'All' || query.trim().length > 0;
  const heading = {
    add: [editingId ? 'EDITING EXPENSE' : 'LOG SPENDING', editingId ? 'Edit expense' : 'Add expense'],
    history: [
      isFiltering
        ? `${filtered.length} ${filtered.length === 1 ? 'MATCH' : 'MATCHES'}`
        : `${filtered.length} ${filtered.length === 1 ? 'ENTRY' : 'ENTRIES'}`,
      'History',
    ],
    summary: ['OVERVIEW', 'Summary'],
  }[tab];

  const TABBAR = 60;
  const monthRatio = budget > 0 ? monthTotal / budget : 0;
  const sumRatio = budget > 0 ? summary.total / budget : 0;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.eyebrow}>{heading[0]}</Text>
          <Text style={st.h1}>{heading[1]}</Text>
          <View style={st.goldBar} />
        </View>
        <TouchableOpacity
          style={st.themeBtn} onPress={() => setThemeName(isDark ? 'light' : 'dark')}
          accessibilityRole="button" accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
          <Text style={st.themeText}>{isDark ? 'Light mode' : 'Dark mode'}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'add' && (
          <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={st.scroll}>
            <View style={st.stats}>
              <View style={st.stat}>
                <Text style={st.statLabel}>Spent today</Text>
                <Text style={st.statValue}>{money(todayTotal)}</Text>
              </View>
              <View style={{ width: 12 }} />
              <View style={st.stat}>
                <Text style={st.statLabel}>This month</Text>
                <Text style={st.statValue}>{money(monthTotal)}</Text>
                {budget > 0 ? (
                  <View>
                    <View style={[st.track, { height: 6, marginTop: 8 }]}>
                      <View style={[st.fill, { height: 6, width: `${Math.min(100, monthRatio * 100)}%`, backgroundColor: statusColor(monthRatio) }]} />
                    </View>
                    <Text style={[st.statSub, monthRatio >= 1 && { color: t.danger }]}>
                      {budget - monthTotal >= 0 ? `${money(budget - monthTotal)} left` : `Over by ${money(monthTotal - budget)}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={st.card}>
              {editingId ? (
                <View style={st.editRow}>
                  <Text style={st.editLabel}>You are editing an existing expense</Text>
                  <TouchableOpacity onPress={resetForm} style={st.linkBtn} accessibilityRole="button">
                    <Text style={st.link}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={st.label}>Amount</Text>
              <View style={[st.amountBox, error && { borderColor: t.danger }]}>
                <Text style={st.cur}>{CURRENCY}</Text>
                <TextInput
                  ref={amountRef} value={amount}
                  onChangeText={(v) => { setAmount(v); if (error) setError(null); }}
                  placeholder="0.00" placeholderTextColor={t.muted}
                  keyboardType="decimal-pad" style={st.amountInput} accessibilityLabel="Amount"
                />
              </View>
              {error ? (
                <Text style={st.error}>{error}</Text>
              ) : parsedPreview > 0 ? (
                <Text style={st.preview}>You are recording {money(parsedPreview)}</Text>
              ) : (
                <Text style={st.hint}>Type the amount, for example 25.50</Text>
              )}

              <Text style={st.label}>Category</Text>
              <View style={st.chips}>
                {CATEGORIES.map((c) => {
                  const on = c.name === category;
                  return (
                    <TouchableOpacity key={c.name} onPress={() => setCategory(c.name)} style={[st.chip, on && st.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <View style={[st.chipDot, { backgroundColor: c.color }]} />
                      <Text style={[st.chipText, on && st.chipTextOn]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={st.label}>When</Text>
              <View style={st.chips}>
                {[['today', 'Today'], ['yesterday', 'Yesterday']].map(([k, label]) => {
                  const on = shownChoice === k;
                  return (
                    <TouchableOpacity
                      key={k} onPress={() => { setDateMode(k); setShowIOSPicker(false); }}
                      style={[st.chip, on && st.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <Text style={[st.chipText, on && st.chipTextOn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={pickDate} style={[st.chip, shownChoice === 'custom' && st.chipOn]} accessibilityRole="button" accessibilityLabel="Pick a past date">
                  <Text style={[st.chipText, shownChoice === 'custom' && st.chipTextOn]}>
                    {shownChoice === 'custom' ? shortDate(effectiveDate) : 'Pick date'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={st.preview}>Recording for {fullDate(effectiveDate)}</Text>
              {showIOSPicker && Platform.OS === 'ios' ? (
                <View>
                  <DateTimePicker
                    value={new Date(customDate || effectiveDate)} mode="date" display="spinner" themeVariant={themeName}
                    maximumDate={new Date()} onChange={(_, d) => { if (d) { setCustomDate(d.getTime()); setDateMode('custom'); } }}
                  />
                  <TouchableOpacity onPress={() => setShowIOSPicker(false)} style={[st.linkBtn, { alignSelf: 'flex-end' }]}>
                    <Text style={st.link}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={st.label}>Note (optional)</Text>
              <TextInput
                value={note} onChangeText={setNote} onSubmitEditing={trySave} returnKeyType="done"
                placeholder="What was it for?" placeholderTextColor={t.muted} style={st.noteInput} accessibilityLabel="Note"
              />

              <TouchableOpacity style={st.primary} onPress={trySave} accessibilityRole="button">
                <Text style={st.primaryText}>{editingId ? 'Save changes' : 'Save expense'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {tab === 'history' && (
          <View style={{ flex: 1 }}>
            <View style={st.searchBox}>
              <TextInput
                value={query} onChangeText={setQuery} returnKeyType="search"
                placeholder="Search notes, categories or amounts" placeholderTextColor={t.muted}
                style={st.searchInput} accessibilityLabel="Search expenses"
              />
              {query ? (
                <TouchableOpacity onPress={() => setQuery('')} style={st.clearBtn} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Text style={st.link}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={st.filterWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
                {['All', ...CATEGORIES.map((c) => c.name)].map((name) => {
                  const on = filter === name;
                  return (
                    <TouchableOpacity key={name} onPress={() => setFilter(name)} style={[st.fChip, on && st.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <Text style={[st.chipText, on && st.chipTextOn]}>{name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
            <FlatList
              data={rows} keyExtractor={(r) => r.id} contentContainerStyle={st.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={st.empty}>
                  <Text style={st.emptyTitle}>{items.length === 0 ? 'No expenses yet' : 'No matches'}</Text>
                  <Text style={st.emptyBody}>{items.length === 0 ? 'Go to Add to log your first one.' : 'Try another search or category.'}</Text>
                </View>
              }
              renderItem={({ item }) =>
                item.header ? (
                  <View style={st.dayRow}>
                    <Text style={st.dayLabel}>{item.label}</Text>
                    <Text style={st.dayTotal}>{money(item.total)}</Text>
                  </View>
                ) : (
                  <View style={st.row}>
                    <View style={[st.rowBar, { backgroundColor: colorOf(item.category) }]} />
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={st.rowTitle}>{item.note || item.category}</Text>
                      <Text style={st.rowMeta}>{item.note ? `${item.category}, ` : ''}{timeLabel(item.date)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={st.rowAmount}>{money(item.amount)}</Text>
                      <View style={{ flexDirection: 'row' }}>
                        <TouchableOpacity onPress={() => startEdit(item)} style={st.actBtn} accessibilityRole="button" accessibilityLabel={`Edit ${item.note || item.category}`}>
                          <Text style={st.act}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => remove(item)} style={st.actBtn} accessibilityRole="button" accessibilityLabel={`Delete ${item.note || item.category}`}>
                          <Text style={[st.act, { color: t.danger }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )
              }
            />
          </View>
        )}

        {tab === 'summary' && (
          <ScrollView contentContainerStyle={st.scroll}>
            <View style={st.segment}>
              {[['month', 'Month'], ['all', 'All time']].map(([k, label]) => (
                <TouchableOpacity key={k} onPress={() => setRange(k)} style={[st.segBtn, range === k && st.segOn]} accessibilityRole="button" accessibilityState={{ selected: range === k }}>
                  <Text style={[st.segText, range === k && { color: t.onGold, fontWeight: '800' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {range === 'month' && (
              <View style={st.monthRow}>
                <TouchableOpacity onPress={() => setMonthOffset((m) => m - 1)} style={st.monthBtn} accessibilityRole="button" accessibilityLabel="Previous month">
                  <Text style={st.monthArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={st.monthName}>{monthName}</Text>
                <TouchableOpacity
                  onPress={() => setMonthOffset((m) => Math.min(0, m + 1))} disabled={monthOffset === 0}
                  style={[st.monthBtn, monthOffset === 0 && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel="Next month">
                  <Text style={st.monthArrow}>›</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[st.card, st.cardFeatured]}>
              <Text style={st.totalLabel}>Total spent</Text>
              <Text style={st.total}>{money(summary.total)}</Text>
              <Text style={st.totalLabel}>
                {summary.count} {summary.count === 1 ? 'expense' : 'expenses'}
                {summary.list[0] ? `, most on ${summary.list[0].name}` : ''}
              </Text>
              <TouchableOpacity
                style={[st.exportBtn, (summary.count === 0 || exporting) && { opacity: 0.45 }]}
                onPress={exportPdf} disabled={summary.count === 0 || exporting}
                accessibilityRole="button" accessibilityLabel="Export a PDF report">
                <Text style={st.exportText}>{exporting ? 'Preparing PDF...' : 'Export PDF report'}</Text>
              </TouchableOpacity>
              {summary.count === 0 ? (
                <Text style={st.hint}>Add expenses to export a report.</Text>
              ) : exportMsg ? (
                <Text style={[st.hint, { color: exportMsg.ok ? t.goldText : t.danger, fontWeight: '600' }]}>{exportMsg.text}</Text>
              ) : (
                <Text style={st.hint}>Creates a formatted report for {range === 'month' ? monthName : 'all time'}.</Text>
              )}
            </View>

            {range === 'month' && (
              <View style={st.card}>
                <Text style={st.cardTitle}>MONTHLY BUDGET</Text>
                {editingBudget ? (
                  <View>
                    <View style={[st.amountBox, budgetError && { borderColor: t.danger }]}>
                      <Text style={st.cur}>{CURRENCY}</Text>
                      <TextInput
                        value={budgetInput} onChangeText={(v) => { setBudgetInput(v); if (budgetError) setBudgetError(null); }}
                        placeholder="e.g. 2000" placeholderTextColor={t.muted} keyboardType="decimal-pad"
                        style={st.amountInput} accessibilityLabel="Monthly budget"
                      />
                    </View>
                    {budgetError ? <Text style={st.error}>{budgetError}</Text> : <Text style={st.hint}>Your spending limit for each month</Text>}
                    <View style={st.btnRow}>
                      <TouchableOpacity style={st.ghostBtn} onPress={() => { setEditingBudget(false); setBudgetError(null); }} accessibilityRole="button">
                        <Text style={st.ghostBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <View style={{ width: 12 }} />
                      <TouchableOpacity style={st.smallPrimary} onPress={saveBudget} accessibilityRole="button">
                        <Text style={st.primaryText}>Save budget</Text>
                      </TouchableOpacity>
                    </View>
                    {budget > 0 ? (
                      <TouchableOpacity onPress={removeBudget} style={st.linkBtn} accessibilityRole="button">
                        <Text style={[st.link, { color: t.danger }]}>Remove budget</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : budget > 0 ? (
                  <View>
                    <View style={st.budgetTop}>
                      <Text style={st.budgetSpent}>{money(summary.total)}</Text>
                      <Text style={st.budgetOf}>of {money(budget)}</Text>
                    </View>
                    <View style={[st.track, { height: 12, borderRadius: 6 }]}>
                      <View style={[st.fill, { height: 12, borderRadius: 6, width: `${Math.min(100, sumRatio * 100)}%`, backgroundColor: statusColor(sumRatio) }]} />
                    </View>
                    <Text style={[st.budgetStatus, { color: statusColor(sumRatio) === t.gold ? t.goldText : statusColor(sumRatio) }]}>
                      {budget - summary.total >= 0
                        ? `${money(budget - summary.total)} left (${Math.round(sumRatio * 100)}% used)`
                        : `Over budget by ${money(summary.total - budget)}`}
                    </Text>
                    <TouchableOpacity onPress={startBudgetEdit} style={st.linkBtn} accessibilityRole="button">
                      <Text style={st.link}>Edit budget</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <Text style={st.emptyBodyLeft}>Set a monthly limit to see how much you have left, and get a warning before you overspend.</Text>
                    <TouchableOpacity style={[st.exportBtn, { marginTop: 14 }]} onPress={startBudgetEdit} accessibilityRole="button">
                      <Text style={st.exportText}>Set a budget</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {summary.count > 0 && (
              <View style={st.card}>
                <Text style={st.cardTitle}>INSIGHTS</Text>
                <View style={st.insRow}>
                  <Text style={st.insKey}>Daily average</Text>
                  <Text style={st.insVal}>{money(summary.avg)}</Text>
                </View>
                {summary.biggest ? (
                  <View style={st.insRow}>
                    <Text style={st.insKey}>Biggest expense</Text>
                    <Text style={st.insVal}>{money(summary.biggest.amount)}</Text>
                  </View>
                ) : null}
                {summary.biggest ? <Text style={st.insNote}>{summary.biggest.note || summary.biggest.category}, {shortDate(summary.biggest.date)}</Text> : null}
                {summary.change ? (
                  <View style={[st.insRow, { borderBottomWidth: 0 }]}>
                    <Text style={st.insKey}>Compared with last month</Text>
                    <Text style={[st.insVal, { flexShrink: 1, textAlign: 'right', marginLeft: 12 }]}>{summary.change}</Text>
                  </View>
                ) : null}
              </View>
            )}

            <View style={st.card}>
              <View style={st.chartHead}>
                <Text style={[st.cardTitle, { marginBottom: 0 }]}>LAST 7 DAYS</Text>
                <Text style={st.dayTotal}>{money(week.total)}</Text>
              </View>
              <View style={st.chart}>
                {week.days.map((d) => (
                  <View key={d.key} style={st.col}>
                    <Text style={st.colVal}>{d.sum > 0 ? compact(d.sum) : ''}</Text>
                    <View style={[st.colBar, { height: d.sum > 0 ? Math.max(8, (d.sum / week.max) * 96) : 4, backgroundColor: d.today ? t.gold : t.barDim }]} />
                    <Text style={[st.colLabel, d.today && { color: t.goldText, fontWeight: '800' }]}>{d.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {summary.list.length === 0 ? (
              <View style={st.empty}>
                <Text style={st.emptyTitle}>Nothing to show yet</Text>
                <Text style={st.emptyBody}>Add expenses to see where your money goes.</Text>
              </View>
            ) : (
              <View style={st.card}>
                <Text style={st.cardTitle}>BY CATEGORY</Text>
                {summary.list.map((r, i) => (
                  <View key={r.name} style={[st.barRow, i === summary.list.length - 1 && { marginBottom: 0 }]}>
                    <View style={st.barHead}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={[st.barDot, { backgroundColor: r.color }]} />
                        <Text style={st.barName}>{r.name}</Text>
                      </View>
                      <Text style={st.barSum}>{money(r.sum)}  ({Math.round(r.pct * 100)}%)</Text>
                    </View>
                    <View style={st.track}><View style={[st.fill, { width: `${Math.max(r.pct * 100, 3)}%`, backgroundColor: r.color }]} /></View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {snack ? (
        <View style={[st.snack, { bottom: TABBAR + insets.bottom + 12 }]}>
          <Text style={st.snackText}>{snack.message}</Text>
          <TouchableOpacity onPress={undo} style={st.snackBtn} accessibilityRole="button">
            <Text style={st.snackAction}>Undo</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={[st.tabs, { paddingBottom: insets.bottom }]}>
        {[['add', 'Add'], ['history', 'History'], ['summary', 'Summary']].map(([k, label]) => (
          <TouchableOpacity key={k} style={st.tab} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            {tab === k && <View style={st.tabBar} />}
            <Text style={[st.tabText, tab === k && st.tabOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {dialog ? (
        <View style={st.overlay}>
          <TouchableOpacity style={st.backdrop} activeOpacity={1} onPress={() => setDialog(null)} accessibilityLabel="Close dialog" />
          <View style={st.dialog} accessibilityViewIsModal>
            <Text style={st.dTitle}>{dialog.title}</Text>
            <Text style={st.dMessage}>{dialog.message}</Text>
            <View style={st.dLines}>
              {dialog.lines.map(([k, v], i) => (
                <View key={k} style={[st.dLine, i === dialog.lines.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={st.dKey}>{k}</Text>
                  <Text style={st.dVal}>{v}</Text>
                </View>
              ))}
            </View>
            {dialog.warnings.map((w) => (
              <View key={w} style={st.warn}><Text style={st.warnText}>{w}</Text></View>
            ))}
            <View style={st.dBtns}>
              <TouchableOpacity style={st.dGhost} onPress={() => setDialog(null)} accessibilityRole="button">
                <Text style={st.dGhostText}>Go back</Text>
              </TouchableOpacity>
              <View style={{ width: 12 }} />
              <TouchableOpacity
                style={[st.dConfirm, dialog.danger && { backgroundColor: t.danger }]}
                onPress={() => { const fn = dialog.onConfirm; setDialog(null); fn(); }} accessibilityRole="button">
                <Text style={[st.dConfirmText, dialog.danger && { color: t.onDanger }]}>{dialog.confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = (t) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 12, marginBottom: 14 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.8, color: t.goldText },
  h1: { fontSize: 34, fontFamily: SERIF, fontWeight: '700', color: t.text, marginTop: 2 },
  goldBar: { width: 44, height: 3, borderRadius: 2, backgroundColor: t.gold, marginTop: 8 },
  themeBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: t.cardBorder, backgroundColor: t.card },
  themeText: { fontSize: 14, fontWeight: '600', color: t.text },
  scroll: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 130 },
  list: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 130 },
  stats: { flexDirection: 'row', marginBottom: 14 },
  stat: { flex: 1, backgroundColor: t.card, borderRadius: 16, borderWidth: 1, borderColor: t.cardBorder, padding: 14 },
  statLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, color: t.muted },
  statValue: { fontSize: 19, fontFamily: SERIF, fontWeight: '700', color: t.goldText, marginTop: 6 },
  statSub: { fontSize: 12, color: t.muted, marginTop: 6, fontWeight: '600' },
  card: { backgroundColor: t.card, borderRadius: 18, borderWidth: 1, borderColor: t.cardBorder, padding: 18, marginBottom: 16 },
  cardFeatured: { borderTopWidth: 3, borderTopColor: t.gold },
  cardTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: t.goldText, marginBottom: 16 },
  editRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.cardBorder },
  editLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: t.goldText, marginRight: 12 },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  link: { fontSize: 15, fontWeight: '700', color: t.goldText },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, color: t.muted, marginBottom: 8, marginTop: 14 },
  amountBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.input, borderRadius: 14, borderWidth: 1, borderColor: t.inputBorder, paddingHorizontal: 16 },
  cur: { fontSize: 22, color: t.goldText, marginRight: 10, fontFamily: SERIF },
  amountInput: { flex: 1, fontSize: 32, fontFamily: SERIF, fontWeight: '700', color: t.text, paddingVertical: 14 },
  hint: { fontSize: 13, color: t.muted, marginTop: 8 },
  preview: { fontSize: 13, color: t.goldText, marginTop: 4, fontWeight: '600' },
  error: { fontSize: 14, color: t.danger, marginTop: 8, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.input, borderRadius: 999, paddingHorizontal: 16, marginRight: 8, marginBottom: 8 },
  chipOn: { backgroundColor: t.gold, borderColor: t.gold },
  chipDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  chipText: { fontSize: 15, color: t.text },
  chipTextOn: { color: t.onGold, fontWeight: '800' },
  noteInput: { backgroundColor: t.input, borderRadius: 12, borderWidth: 1, borderColor: t.inputBorder, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: t.text },
  primary: { minHeight: 56, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: t.gold, marginTop: 22 },
  primaryText: { fontSize: 17, fontWeight: '800', letterSpacing: 0.3, color: t.onGold },
  smallPrimary: { flex: 1, minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: t.gold },
  ghostBtn: { flex: 1, minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.input },
  ghostBtnText: { fontSize: 16, fontWeight: '700', color: t.text },
  btnRow: { flexDirection: 'row', marginTop: 14 },
  exportBtn: { minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, borderColor: t.gold, marginTop: 16 },
  exportText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.3, color: t.goldText },
  searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 8, backgroundColor: t.input, borderRadius: 14, borderWidth: 1, borderColor: t.inputBorder, paddingLeft: 16 },
  searchInput: { flex: 1, fontSize: 16, color: t.text, paddingVertical: 14 },
  clearBtn: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  filterWrap: { marginBottom: 8 },
  filterRow: { paddingHorizontal: 20, alignItems: 'center' },
  fChip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.card, borderRadius: 999, paddingHorizontal: 16, marginRight: 8 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 10 },
  dayLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: t.muted },
  dayTotal: { fontSize: 13, fontWeight: '700', color: t.goldText },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 16, borderWidth: 1, borderColor: t.cardBorder, padding: 14, marginBottom: 10 },
  rowBar: { width: 4, alignSelf: 'stretch', minHeight: 44, borderRadius: 2, marginRight: 14 },
  rowTitle: { fontSize: 17, color: t.text },
  rowMeta: { fontSize: 13, color: t.muted, marginTop: 3 },
  rowAmount: { fontSize: 17, fontFamily: SERIF, fontWeight: '700', color: t.text },
  actBtn: { minHeight: 44, justifyContent: 'center', paddingLeft: 14 },
  act: { fontSize: 14, fontWeight: '700', color: t.goldText },
  segment: { flexDirection: 'row', backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.cardBorder, padding: 4, marginBottom: 14 },
  segBtn: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  segOn: { backgroundColor: t.gold },
  segText: { fontSize: 15, color: t.muted, fontWeight: '600' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.cardBorder, backgroundColor: t.card },
  monthArrow: { fontSize: 26, color: t.goldText, fontWeight: '700', marginTop: -2 },
  monthName: { fontSize: 18, fontFamily: SERIF, fontWeight: '700', color: t.text },
  totalLabel: { fontSize: 15, color: t.muted },
  total: { fontSize: 38, fontFamily: SERIF, fontWeight: '700', color: t.goldText, marginVertical: 6 },
  budgetTop: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  budgetSpent: { fontSize: 24, fontFamily: SERIF, fontWeight: '700', color: t.text },
  budgetOf: { fontSize: 15, color: t.muted, marginLeft: 8 },
  budgetStatus: { fontSize: 15, fontWeight: '700', marginTop: 10 },
  emptyBodyLeft: { fontSize: 15, color: t.muted, lineHeight: 22 },
  insRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.cardBorder },
  insKey: { fontSize: 15, color: t.muted },
  insVal: { fontSize: 16, fontFamily: SERIF, fontWeight: '700', color: t.text },
  insNote: { fontSize: 12, color: t.muted, marginTop: -6, marginBottom: 10 },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  colVal: { fontSize: 10, color: t.muted, marginBottom: 4, height: 14 },
  colBar: { width: 22, borderRadius: 6 },
  colLabel: { fontSize: 11, color: t.muted, marginTop: 6, fontWeight: '600' },
  barRow: { marginBottom: 18 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  barDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  barName: { fontSize: 16, fontWeight: '600', color: t.text },
  barSum: { fontSize: 14, color: t.muted },
  track: { height: 10, backgroundColor: t.track, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  empty: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontFamily: SERIF, fontWeight: '700', color: t.text, marginBottom: 6 },
  emptyBody: { fontSize: 15, color: t.muted, textAlign: 'center' },
  snack: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.card, borderWidth: 1, borderColor: t.gold, borderRadius: 14, paddingLeft: 18, paddingRight: 6, elevation: 8 },
  snackText: { fontSize: 16, color: t.text, fontWeight: '600' },
  snackBtn: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 16 },
  snackAction: { fontSize: 16, fontWeight: '800', color: t.goldText },
  tabs: { flexDirection: 'row', backgroundColor: t.tab, borderTopWidth: 1, borderTopColor: t.cardBorder },
  tab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 16, color: t.muted, fontWeight: '600' },
  tabOn: { color: t.goldText, fontWeight: '800' },
  tabBar: { position: 'absolute', top: 0, width: 36, height: 3, borderRadius: 2, backgroundColor: t.gold },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 22, backgroundColor: t.overlay },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dialog: { backgroundColor: t.card, borderRadius: 20, borderWidth: 1, borderColor: t.gold, padding: 22 },
  dTitle: { fontSize: 22, fontFamily: SERIF, fontWeight: '700', color: t.text },
  dMessage: { fontSize: 14, color: t.muted, marginTop: 6, marginBottom: 14, lineHeight: 20 },
  dLines: { backgroundColor: t.input, borderRadius: 14, borderWidth: 1, borderColor: t.inputBorder, paddingHorizontal: 14 },
  dLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.inputBorder },
  dKey: { fontSize: 14, color: t.muted },
  dVal: { fontSize: 15, fontWeight: '700', color: t.text, flexShrink: 1, textAlign: 'right', marginLeft: 16 },
  warn: { marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: t.amber, padding: 12 },
  warnText: { fontSize: 14, color: t.amber, fontWeight: '700', lineHeight: 20 },
  dBtns: { flexDirection: 'row', marginTop: 18 },
  dGhost: { flex: 1, minHeight: 54, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: t.inputBorder },
  dGhostText: { fontSize: 16, fontWeight: '700', color: t.text },
  dConfirm: { flex: 1.3, minHeight: 54, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: t.gold, paddingHorizontal: 8 },
  dConfirmText: { fontSize: 16, fontWeight: '800', color: t.onGold, textAlign: 'center' },
});
