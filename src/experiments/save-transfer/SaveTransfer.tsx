import { useRef, useState } from 'react';
import { applyTransfer, collectRecords, parseTransfer, REASONS, transferFileName, type TransferFile } from './transfer';
import './save-transfer.css';

/**
 * ?play=save — the records' move: write them to a file, read them from one.
 * Nothing leaves the device by itself; the file goes where the player puts it.
 */
export default function SaveTransfer() {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<{ file: TransferFile; count: number } | null>(null);
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const save = async () => {
    try {
      const file = collectRecords(window.localStorage);
      const count = Object.keys(file.entries).length;
      if (!count) { setMessage('まだ書き出す記録がありません。'); return; }
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
      const name = transferFileName();
      const shareable = new File([blob], name, { type: 'application/json' });
      // On a phone the share sheet puts the file in Files or Messages; elsewhere a plain download.
      if (navigator.canShare?.({ files: [shareable] })) {
        try { await navigator.share({ files: [shareable], title: 'PURAの記録' }); setMessage(`${count}件の記録を、ファイルにしました。`); return; }
        catch (error) { if ((error as Error).name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      setMessage(`${count}件の記録を、ファイルにしました（${name}）。`);
    } catch { setMessage('この端末では、記録を読み出せませんでした。'); }
  };

  const choose = async (files: FileList | null) => {
    const f = files?.[0]; if (!f) return;
    setPending(null); setDone(false);
    const parsed = parseTransfer(await f.text());
    if (!parsed.ok) { setMessage(REASONS[parsed.reason]); return; }
    setMessage(''); setPending({ file: parsed.file, count: parsed.count });
  };

  const apply = () => {
    if (!pending) return;
    try { applyTransfer(window.localStorage, pending.file); setDone(true); setPending(null); setMessage(''); }
    catch { setMessage('この端末に、記録を書き込めませんでした。'); }
  };

  return <main className="save-transfer">
    <h1>記録の引っ越し</h1>
    <p>ベスト記録や設定を、ファイルにして持ち運べます。機種変更や、ブラウザを変えるときに。</p>
    <section><h2>書き出す</h2><p>この端末の記録を、ファイルにします。</p><button onClick={save}>記録をファイルにする</button></section>
    <section><h2>読み込む</h2><p>ファイルの記録を、この端末に書き込みます。いまある同じ種類の記録は置き換わります。</p>
      <button onClick={() => input.current?.click()}>ファイルを選ぶ</button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={e => { void choose(e.target.files); e.target.value = ''; }}/></section>
    {pending && <section className="save-transfer-confirm" role="alert"><p>{pending.count}件の記録が見つかりました。書き込みますか？</p>
      <div><button onClick={apply}>書き込む</button><button className="is-quiet" onClick={() => setPending(null)}>やめる</button></div></section>}
    {done && <section className="save-transfer-done" role="status"><p>書き込みました。</p><a href="./">遊びに戻る</a></section>}
    {message && <p className="save-transfer-message" role="status">{message}</p>}
    {!done && <a className="save-transfer-back" href="./">もどる</a>}
  </main>;
}
