import { AlertCircle, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../../shared/i18n.ts';
import type { CostLogEntry, StudioSettings } from '../../shared/types.ts';
import { api } from '../../services/api.ts';

interface BudgetViewProps {
  settings: StudioSettings;
}

export function BudgetView({ settings }: BudgetViewProps) {
  const lang = settings.language;
  const [logs, setLogs] = useState<CostLogEntry[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [byModel, setByModel] = useState<
    Array<{ modelId: string; totalImages: number; totalEstimatedUsd: number }>
  >([]);

  useEffect(() => {
    api
      .getBudget()
      .then((data) => {
        setLogs(data.logs);
        setTotalUsd(data.totalEstimatedUsd);
        setTotalImages(data.totalImages);
        setByModel(data.byModel);
      })
      .catch(() => {});
  }, []);

  const rate = settings.currency === 'EUR' ? settings.eurExchangeRate || 0.92 : 1;
  const sym = settings.currency === 'EUR' ? '€' : '$';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[#ECEEF2]">
          {lang === 'en' ? 'Budget & API Consumption' : 'Budget & Consommation'}
        </h1>
        <p className="text-xs text-[#8E96A4] mt-1">
          {lang === 'en'
            ? 'Transparent ledger of every confirmed image generation and retouch, using editable pricing schedules.'
            : 'Journal transparent de chaque génération et retouche confirmée, basé sur la grille tarifaire modifiable.'}
        </p>
      </div>

      {/* Transparency Notice */}
      <div className="p-4 bg-[#131519] border border-[#262A33] rounded-md flex items-start gap-3 text-xs text-[#A6AEBC]">
        <AlertCircle className="w-4 h-4 text-[#C9A66B] shrink-0 mt-0.5" />
        <p>{t(lang, 'estimatedCostNote')}</p>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-[#131519] border border-[#262A33] rounded-md">
          <div className="text-xs text-[#8E96A4]">
            {lang === 'en' ? 'Cumulative Estimated Spend' : 'Coût estimé cumulé'}
          </div>
          <div className="font-mono tabular-nums text-2xl font-semibold text-[#C9A66B] mt-1.5">
            {sym}
            {(totalUsd * rate).toFixed(3)} {settings.currency}
          </div>
        </div>
        <div className="p-5 bg-[#131519] border border-[#262A33] rounded-md">
          <div className="text-xs text-[#8E96A4]">
            {lang === 'en' ? 'Total Generated / Retouched Images' : 'Total images générées / retouchées'}
          </div>
          <div className="font-mono tabular-nums text-2xl font-semibold text-[#ECEEF2] mt-1.5">
            {totalImages}
          </div>
        </div>
        <div className="p-5 bg-[#131519] border border-[#262A33] rounded-md">
          <div className="text-xs text-[#8E96A4]">
            {lang === 'en' ? 'Actual Billed Currency Reported by API' : 'Montant réel facturé retourné par API'}
          </div>
          <div className="text-sm text-[#A6AEBC] mt-2">
            {lang === 'en'
              ? 'Not returned in currency (tokens logged below; see Google Cloud Billing)'
              : 'Non retourné en devise (tokens enregistrés ci-dessous ; voir Google Cloud Billing)'}
          </div>
        </div>
      </div>

      {/* Model Breakdown */}
      {byModel.length > 0 && (
        <div className="p-5 bg-[#131519] border border-[#262A33] rounded-md space-y-3">
          <h2 className="font-display text-sm font-semibold text-[#ECEEF2]">
            {lang === 'en' ? 'Breakdown by Model' : 'Répartition par modèle'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {byModel.map((m) => (
              <div key={m.modelId} className="p-3.5 bg-[#0B0C0E] border border-[#262A33] rounded-md">
                <div className="font-mono text-xs text-[#ECEEF2]">{m.modelId}</div>
                <div className="font-mono tabular-nums text-base font-semibold text-[#C9A66B] mt-1">
                  {sym}
                  {(m.totalEstimatedUsd * rate).toFixed(3)}
                </div>
                <div className="text-xs text-[#7D8594] font-mono tabular-nums mt-0.5">
                  {m.totalImages} img
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Consumption Audit Ledger */}
      <div className="bg-[#131519] border border-[#262A33] rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#262A33] flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-[#ECEEF2]">
            {lang === 'en' ? 'Generation History & Costs' : 'Historique des générations et coûts'}
          </h2>
          <span className="text-xs font-mono tabular-nums text-[#7D8594]">
            {logs.length} {lang === 'en' ? 'records' : 'opérations'}
          </span>
        </div>

        {logs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Wallet className="w-7 h-7 text-[#565E6E] mx-auto" />
            <p className="text-xs text-[#8E96A4]">
              {lang === 'en'
                ? 'No image generations recorded yet.'
                : 'Aucune génération payante enregistrée pour le moment.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F1115] text-[#8E96A4] border-b border-[#262A33]">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Date</th>
                  <th className="py-2.5 px-4 font-medium">Projet / Note</th>
                  <th className="py-2.5 px-4 font-medium">Modèle</th>
                  <th className="py-2.5 px-4 font-medium">Format</th>
                  <th className="py-2.5 px-4 font-medium text-right">Images</th>
                  <th className="py-2.5 px-4 font-medium text-right">Tokens API</th>
                  <th className="py-2.5 px-4 font-medium text-right">Estimé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262A33]/70">
                {logs.map((row) => (
                  <tr key={row.id} className="hover:bg-[#171A21]">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#8E96A4] whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}
                    </td>
                    <td className="py-2.5 px-4 text-[#ECEEF2]">
                      <div className="font-medium">{row.projectTitle || '—'}</div>
                      <div className="text-[11px] text-[#7D8594]">{row.notes}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#C6CDD8]">{row.modelId}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#8E96A4]">
                      {row.resolution} · {row.aspectRatio}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-[#ECEEF2]">
                      {row.imageCount}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-[#8E96A4]">
                      {row.usageTokens?.totalTokenCount ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-[#C9A66B] font-medium">
                      {sym}
                      {(row.estimatedCostUsd * rate).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
