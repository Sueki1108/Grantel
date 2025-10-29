
"use client";

import * as React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProcessedData } from '@/lib/excel-processor';
import { ClipboardList, Download, FileQuestion, FileText, FileDown, FileSpreadsheet, Settings, Check, ListFilter, RefreshCw, ChevronDown, ChevronRight, MinusCircle, RotateCw, HelpCircle } from 'lucide-react';
import { DataTable } from './data-table';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { AllClassifications } from './imobilizado-analysis';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { getColumnsWithCustomRender } from '@/lib/columns-helper';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';


interface Section {
    id: string;
    title: string;
    description: string;
    data: any[];
    columns: any[];
    summary?: React.ReactNode;
    subSections?: {
        id: string;
        title: string;
        data: any[];
        columns: any[];
        description?: string;
    }[]
}

interface PendingIssuesReportProps {
    processedData: ProcessedData | null;
    allPersistedClassifications: AllClassifications;
    onForceUpdate: (allData: AllClassifications) => void;
}

const IMOBILIZADO_STORAGE_KEY = 'imobilizadoClassifications_v2';

const modificationDetails: {
    [key: string]: { title: string; description: string };
} = {
    count9900: { title: 'Contadores', description: 'A contagem de linhas em cada bloco (registos x990) e a contagem total (9999) foram recalculadas para corresponder ao número real de linhas no ficheiro.' },
    ieCorrection: { title: 'IE (NF-e)', description: 'A Inscrição Estadual (IE) de participantes (registo 0150) foi corrigida com base nos dados dos XMLs para garantir a conformidade.' },
    cteSeriesCorrection: { title: 'Série (CT-e)', description: 'A série de CT-es (registo D100) foi corrigida com base nos dados dos XMLs de CTe para corresponder à série original.' },
    addressSpaces: { title: 'Endereços', description: 'Espaços múltiplos no campo de complemento do endereço (registo 0150) foram substituídos por um único espaço para evitar erros de formatação.' },
    truncation: { title: 'Truncamento', description: 'Campos de texto livre (ex: observações nos registos 0450, 0460, C110) foram limitados a 235 caracteres para evitar erros de importação.' },
    unitStandardization: { title: 'Unidades', description: 'Unidades de medida de produtos (registos 0200, C170) foram padronizadas para \'un\' para manter a consistência e evitar erros.' },
    removed0190: { title: '0190 Removidos', description: 'Registos do tipo \'0190\' desnecessários (todos exceto \'un\' e \'pc\') foram removidos para limpar o ficheiro e evitar potenciais problemas.' },
    blockCount: { title: 'Contadores de Bloco', description: 'A contagem de linhas para cada bloco do SPED (ex: Bloco C, Bloco D) foi recalculada.' },
    totalLineCount: { title: 'Contador Total', description: 'A contagem total de linhas do ficheiro (registro 9999) foi recalculada para refletir o número final de linhas.' },
};



export function PendingIssuesReport({ processedData, allPersistedClassifications, onForceUpdate }: PendingIssuesReportProps) {
    const { toast } = useToast();
    const [ignoredItems, setIgnoredItems] = React.useState<Set<string>>(new Set());
    const [exportOptions, setExportOptions] = React.useState<Record<string, boolean>>({});
    const [openCollapsibles, setOpenCollapsibles] = React.useState<Set<string>>(new Set());
    const [currentClassifications, setCurrentClassifications] = React.useState(allPersistedClassifications);

     React.useEffect(() => {
        setCurrentClassifications(allPersistedClassifications);
    }, [allPersistedClassifications]);

    const handleForceUpdate = () => {
        try {
            const savedData = localStorage.getItem(IMOBILIZADO_STORAGE_KEY);
            const latestClassifications = savedData ? JSON.parse(savedData) : {};
            setCurrentClassifications(latestClassifications);
            onForceUpdate(latestClassifications);
            toast({title: "Relatório Atualizado", description: "Os dados foram recarregados com as informações mais recentes."})
        } catch (e) {
            console.error("Failed to re-load classifications from localStorage", e);
            toast({variant: 'destructive', title: "Erro ao Atualizar", description: "Não foi possível recarregar as classificações."});
        }
    };


    const toggleCollapsible = (id: string) => {
        setOpenCollapsibles(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const toggleIgnoredItem = (itemKey: string) => {
        setIgnoredItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemKey)) {
                newSet.delete(itemKey);
            } else {
                newSet.add(itemKey);
            }
            return newSet;
        });
    };

    const sections = React.useMemo((): Section[] => {
        if (!processedData) return [];

        const reportSections: Section[] = [];
        const competenceKey = processedData.competence || 'default';

        // 1. Imobilizado
        const imobilizadoItems = (processedData.sheets?.['Imobilizados'] || [])
            .filter(item => {
                const classification = currentClassifications[competenceKey]?.classifications?.[item.uniqueItemId]?.classification;
                return classification === 'imobilizado';
            })
            .map(item => {
                const persistedForCompetence = currentClassifications[competenceKey];
                const accountCode = persistedForCompetence?.accountCodes?.[item.id]?.accountCode;
                const nfeHeader = (processedData.sheets['Notas Válidas'] || []).find(n => n['Chave Unica'] === item['Chave Unica']);

                return {
                    'Fornecedor': nfeHeader?.Fornecedor || item.Fornecedor || 'N/A',
                    'Número da Nota': item['Número da Nota'],
                    'Descrição': item['Descrição'],
                    'Valor Total': item['Valor Total'],
                    'Código do Ativo': accountCode || '(não definido)',
                    '__itemKey': `imobilizado-${item.id}`
                };
            });

        const imobilizadoColumns = React.useMemo(() => getColumnsWithCustomRender(imobilizadoItems, Object.keys(imobilizadoItems[0] || {}).filter(k => k !== '__itemKey')), [imobilizadoItems]);

        if (imobilizadoItems.length > 0) {
            reportSections.push({
                id: 'imobilizado',
                title: 'Itens Classificados como Ativo Imobilizado',
                description: 'Itens com valor > R$ 1.200,00 classificados manualmente como Ativo Imobilizado. Verifique se o código do ativo está correto.',
                data: imobilizadoItems,
                columns: imobilizadoColumns,
            });
        }
        
        // 2. CFOP Incorreto ou a Verificar
        const cfopValidationItems = processedData.reconciliationResults?.reconciled || [];
        const cfopValidationsForCompetence = currentClassifications[competenceKey]?.cfopValidations?.classifications || {};
        
        const cfopPendingItems = cfopValidationItems.filter(item => {
             const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
             const classification = cfopValidationsForCompetence[uniqueKey]?.classification;
             return classification === 'incorrect' || classification === 'verify';
        });

        if (cfopPendingItems.length > 0) {
             const groupedByCfop: Record<string, any[]> = cfopPendingItems.reduce((acc, item) => {
                const cfop = item.Sienge_CFOP || 'N/A';
                if (!acc[cfop]) acc[cfop] = [];
                acc[cfop].push({
                    ...item,
                    '__itemKey': `cfop-pending-${item['Chave de acesso']}-${item.Item}`
                });
                return acc;
            }, {} as Record<string, any[]>);

            const cfopSubSections = Object.entries(groupedByCfop).map(([cfop, items]) => {
                const columns = getColumnsWithCustomRender(items, Object.keys(items[0] || {}).filter(k => k !== '__itemKey'));
                return {
                    id: `cfop_pending_${cfop}`,
                    title: `CFOP ${cfop}`,
                    data: items,
                    columns,
                };
            });

            reportSections.push({
                id: 'cfop_issues',
                title: 'Itens com Validação de CFOP Pendente',
                description: 'Itens conciliados que foram marcados manualmente como "Incorreto" ou "A Verificar".',
                data: [],
                columns: [],
                subSections: cfopSubSections
            });
        }


        // 3. Notas não Lançadas
        const notFoundInSped = (processedData.keyCheckResults?.keysNotFoundInTxt || []);
        const notFoundNfe = notFoundInSped.filter(item => (item.type === 'NFE' || item.type === 'Saída')).map(item => ({...item, '__itemKey': `notfound-${item.key}`}));
        const notFoundCte = notFoundInSped.filter(item => item.type === 'CTE').map(item => ({...item, '__itemKey': `notfound-${item.key}`}));
        
        if (notFoundInSped.length > 0) {
            const nfeColumns = getColumnsWithCustomRender(notFoundNfe, Object.keys(notFoundNfe[0] || {}).filter(k => k !== '__itemKey'));
            const cteColumns = getColumnsWithCustomRender(notFoundCte, Object.keys(notFoundCte[0] || {}).filter(k => k !== '__itemKey'));
            reportSections.push({
                id: 'sped_not_found',
                title: 'Notas não Lançadas',
                description: 'As chaves abaixo constam como válidas no seu controlo, mas não foram localizadas no arquivo SPED, indicando que podem não ter sido escrituradas.',
                data: [],
                columns: [],
                subSections: [
                    { id: 'nfe_not_found', title: 'NF-e', data: notFoundNfe, columns: nfeColumns},
                    { id: 'cte_not_found', title: 'CT-e', data: notFoundCte, columns: cteColumns}
                ]
            });
        }
        
        // 4. SPED - Não na planilha
        const notInSheet = (processedData.keyCheckResults?.keysInTxtNotInSheet || []);
        const notInSheetNfe = notInSheet.filter(item => item.type === 'NFE').map(item => ({...item, '__itemKey': `notinSheet-${item.key}`}));
        const notInSheetCte = notInSheet.filter(item => item.type === 'CTE').map(item => ({...item, '__itemKey': `notinSheet-${item.key}`}));
        const notInSheetNfeCols = getColumnsWithCustomRender(notInSheetNfe, Object.keys(notInSheetNfe[0] || {}).filter(k => k !== '__itemKey'));
        const notInSheetCteCols = getColumnsWithCustomRender(notInSheetCte, Object.keys(notInSheetCte[0] || {}).filter(k => k !== '__itemKey'));

        if (notInSheet.length > 0) {
            reportSections.push({
                id: 'sped_not_in_sheet',
                title: 'Chaves no SPED Não Encontradas nas Notas Válidas',
                description: 'Estas chaves existem no SPED, mas não foram classificadas como válidas no seu controlo. Verifique se são notas canceladas, devolvidas ou escrituradas indevidamente.',
                data: [],
                columns: [],
                subSections: [
                    { id: 'nfe_not_in_sheet', title: 'NF-e', data: notInSheetNfe, columns: notInSheetNfeCols},
                    { id: 'cte_not_in_sheet', title: 'CT-e', data: notInSheetCte, columns: notInSheetCteCols}
                ]
            });
        }


        // 5. SPED - Inconformidades (dividido em sub-secções)
        const { ufDivergences, ieDivergences, dateDivergences, valueDivergences } = processedData.keyCheckResults || {};
        const ufCols = getColumnsWithCustomRender(ufDivergences || [], Object.keys(ufDivergences?.[0] || {}).filter(k => k !== '__itemKey'));
        const ieCols = getColumnsWithCustomRender(ieDivergences || [], Object.keys(ieDivergences?.[0] || {}).filter(k => k !== '__itemKey'));
        const dateCols = getColumnsWithCustomRender(dateDivergences || [], Object.keys(dateDivergences?.[0] || {}).filter(k => k !== '__itemKey'));
        const valueCols = getColumnsWithCustomRender(valueDivergences || [], Object.keys(valueDivergences?.[0] || {}).filter(k => k !== '__itemKey'));
        
        if ((ufDivergences?.length || 0) > 0 || (ieDivergences?.length || 0) > 0 || (dateDivergences?.length || 0) > 0 || (valueDivergences?.length || 0) > 0) {
            const subSections = [
                { id: 'uf', title: 'Divergência de UF', data: (ufDivergences || []).map(item => ({...item, '__itemKey': `uf-${item['Chave de Acesso']}`})), columns: ufCols },
                { id: 'ie', title: 'Divergência de IE', data: (ieDivergences || []).map(item => ({...item, '__itemKey': `ie-${item['Chave de Acesso']}`})), columns: ieCols },
                { id: 'date', title: 'Divergência de Data', data: (dateDivergences || []).map(item => ({...item, '__itemKey': `date-${item['Chave de Acesso']}`})), columns: dateCols },
                { id: 'value', title: 'Divergência de Valor', data: (valueDivergences || []).map(item => ({...item, '__itemKey': `value-${item['Chave de Acesso']}`})), columns: valueCols },
            ].filter(sub => sub.data.length > 0);

            reportSections.push({
                id: 'sped_divergences',
                title: 'Inconformidades Entre XML e SPED',
                description: 'Divergências nos dados de notas que constam em ambos os locais (XML e SPED), separadas por tipo.',
                data: [],
                columns: [],
                subSections
            });
        }
        
        // 6. SPED - Modificações
        const spedCorrections = processedData.spedCorrections || [];
        if (spedCorrections.length > 0 && spedCorrections[0].linesModified > 0) {
             const mods = spedCorrections[0].modifications;
             const groupedCounterModifications = [...mods.blockCount, ...mods.totalLineCount, ...mods.count9900];
             const summaryNode = (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                    <p><strong>Contadores:</strong> {groupedCounterModifications.length}</p>
                    <p><strong>IE (NF-e):</strong> {mods.ieCorrection.length}</p>
                    <p><strong>Série (CT-e):</strong> {mods.cteSeriesCorrection.length}</p>
                    <p><strong>Endereços:</strong> {mods.addressSpaces.length}</p>
                    <p><strong>Truncamento:</strong> {mods.truncation.length}</p>
                    <p><strong>Unidades:</strong> {mods.unitStandardization.length}</p>
                    <p><strong>0190 Removidos:</strong> {mods.removed0190.length}</p>
                </div>
            );

            const allModifications = {
                ...mods,
                groupedCounters: groupedCounterModifications
            };
            delete allModifications.blockCount;
            delete allModifications.totalLineCount;
            delete allModifications.count9900;
            
            const orderedModKeys: (keyof typeof allModifications)[] = ['groupedCounters', 'ieCorrection', 'cteSeriesCorrection', 'addressSpaces', 'truncation', 'unitStandardization', 'removed0190'];

             const subSections = orderedModKeys.map(key => {
                const value = allModifications[key];
                const detailKey = key === 'groupedCounters' ? 'count9900' : key;
                const detail = modificationDetails[detailKey];
                
                if(Array.isArray(value) && value.length > 0) {
                    const data = value.map((v: any, i: number) => ({
                        'Linha': v.lineNumber,
                        'Original': v.original || v.line,
                        'Corrigido': v.corrected || '(removida)',
                        '__itemKey': `spedmod-${key}-${i}`
                    }));
                    const columns = getColumnsWithCustomRender(data, ['Linha', 'Original', 'Corrigido']);
                    return { id: `sped_mod_${key}`, title: detail?.title || key, data, columns, description: detail?.description };
                }
                return null;
            }).filter(sub => sub !== null) as { id: string; title: string; data: any[]; columns: any[]; description?: string}[];
            
            if (subSections.length > 0) {
                reportSections.push({
                    id: 'sped_corrections',
                    title: 'Modificações Realizadas no Arquivo SPED',
                    description: 'O corretor automático realizou as seguintes alterações no arquivo SPED para garantir a conformidade.',
                    data: [],
                    columns: [],
                    summary: summaryNode,
                    subSections
                });
            }
        }
        
        // 7. Revenda
        const resaleItems = (processedData.resaleAnalysis?.xmls || []).map((f, i) => ({
            'Ficheiro XML de Revenda': f.name,
            '__itemKey': `resale-${i}`
        }));
        const resaleColumns = getColumnsWithCustomRender(resaleItems, Object.keys(resaleItems[0] || {}).filter(k => k !== '__itemKey'));
         if (resaleItems.length > 0) {
            reportSections.push({
                id: 'resale_items',
                title: 'Notas Fiscais de Revenda Identificadas',
                description: 'Os seguintes XMLs foram identificados como operações de revenda, com base nos CFOPs correspondentes na planilha do Sienge.',
                data: resaleItems,
                columns: resaleColumns
            });
        }


        return reportSections;
    }, [processedData, currentClassifications]);

    React.useEffect(() => {
        const initialOptions: Record<string, boolean> = {};
        sections.forEach(s => { 
            initialOptions[s.id] = true;
            if (s.subSections) {
                s.subSections.forEach(sub => {
                    initialOptions[sub.id] = true;
                });
            }
        });
        setExportOptions(initialOptions);
    }, [sections]);

    const handleToggleExportOption = (id: string, checked: boolean, isMainSection: boolean) => {
        setExportOptions(prev => {
            const newOptions = {...prev, [id]: checked};
            if (isMainSection) {
                const section = sections.find(s => s.id === id);
                section?.subSections?.forEach(sub => {
                    newOptions[sub.id] = checked;
                });
            }
            return newOptions;
        });
    };

    const exportToExcel = (sectionsToExport: Section[], fileName: string) => {
        const workbook = XLSX.utils.book_new();

        sectionsToExport.forEach(section => {
            if (section.subSections && section.subSections.length > 0) {
                section.subSections.forEach(sub => {
                     if (!exportOptions[sub.id]) return;
                     const exportData = sub.data.filter(item => !ignoredItems.has(item.__itemKey)).map(({__itemKey, ...rest}) => rest);
                     if (exportData.length > 0) {
                        const worksheet = XLSX.utils.json_to_sheet(exportData);
                        const sheetName = sub.title.replace(/[:\\/?*[\]]/g, '').substring(0, 31);
                        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                    }
                })
            } else {
                 if (!exportOptions[section.id]) return;
                 const exportData = section.data.filter(item => !ignoredItems.has(item.__itemKey)).map(({__itemKey, ...rest}) => rest);
                 if (exportData.length > 0) {
                    const worksheet = XLSX.utils.json_to_sheet(exportData);
                    const sheetName = section.title.replace(/[:\\/?*[\]]/g, '').substring(0, 31);
                    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                }
            }
        });
        
        if (workbook.SheetNames.length === 0) {
             toast({ variant: 'destructive', title: 'Nenhuma pendência para exportar' });
            return;
        }
        
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
        toast({ title: 'Relatório Excel Gerado' });
    };

    const exportToPdf = (sectionsToExport: Section[], reportTitle: string) => {
        const doc = new jsPDF({ orientation: 'landscape' });
        
        let isFirstPage = true;

        sectionsToExport.forEach(section => {
            const processSectionData = (data: any[], columns: any[], title: string, description: string) => {
                 const exportData = data.filter(item => !ignoredItems.has(item.__itemKey)).map(({__itemKey, ...rest}) => rest);
                 if (exportData.length === 0) return;

                if (!isFirstPage) doc.addPage();
                isFirstPage = false;
                
                 autoTable(doc, {
                    head: [], body: [],
                    didDrawPage: (data) => {
                         doc.setFontSize(14);
                         doc.text(title, data.settings.margin.left, 20);
                         doc.setFontSize(9);
                         doc.setTextColor(100);
                         const splitDescription = doc.splitTextToSize(description, doc.internal.pageSize.getWidth() - data.settings.margin.left - data.settings.margin.right);
                         doc.text(splitDescription, data.settings.margin.left, 26);
                    },
                     startY: 40,
                });
                
                const validColumns = columns.filter(c => c.id !== '__itemKey');
                const tableColumns = validColumns.map((col: any) => typeof col.header === 'function' ? col.id : col.header);
                const tableAccessors = validColumns.map((col:any) => col.id);
                const tableRows = exportData.map(row => tableAccessors.map((acc: string) => String(row[acc] ?? '')));

                autoTable(doc, {
                    head: [tableColumns],
                    body: tableRows,
                    startY: (doc as any).lastAutoTable.finalY + 2,
                    theme: 'striped',
                    headStyles: { fillColor: [41, 128, 185], cellPadding: 2, halign: 'center', minCellHeight: 10, fontSize: 8 },
                    styles: { fontSize: 7, cellPadding: 1, overflow: 'linebreak' },
                    columnStyles: { 0: { cellWidth: 'auto' } }
                });
            }

            if (section.subSections) {
                 section.subSections.forEach(sub => {
                    if (exportOptions[sub.id]) {
                        processSectionData(sub.data, sub.columns, `${section.title}: ${sub.title}`, sub.description || section.description)
                    }
                });
            } else {
                 if (exportOptions[section.id]) {
                    processSectionData(section.data, section.columns, section.title, section.description);
                }
            }
        });

        if (isFirstPage) {
            toast({ variant: 'destructive', title: 'Nenhuma pendência para exportar' });
            return;
        }

        doc.save(`${reportTitle}.pdf`);
        toast({ title: 'Relatório PDF Gerado' });
    };

    const handleExportAll = (format: 'excel' | 'pdf') => {
        const selectedSections = sections.filter(s => exportOptions[s.id] || s.subSections?.some(sub => exportOptions[sub.id]));
        if (selectedSections.length === 0) {
            toast({ variant: 'destructive', title: 'Nenhuma secção selecionada para exportar.' });
            return;
        }
        if (format === 'excel') {
            exportToExcel(selectedSections, 'Relatorio_Completo_Pendencias');
        } else {
            exportToPdf(selectedSections, 'Relatorio_Completo_Pendencias');
        }
    };
    
    // Memoize columns for DataTable
    const memoizedActionColumn = React.useMemo(() => ({
        id: 'actions',
        header: () => <div className="text-center">Ignorar</div>,
        cell: ({ row }: any) => {
            const itemKey = row.original.__itemKey;
            return (
                <div className='flex justify-center'>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleIgnoredItem(itemKey)}>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span>{ignoredItems.has(itemKey) ? <RotateCw className='h-4 w-4 text-green-600' /> : <MinusCircle className='h-4 w-4' />}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{ignoredItems.has(itemKey) ? "Re-incluir na exportação" : "Ignorar na exportação"}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </Button>
                </div>
            );
        },
    }), [ignoredItems]);


    if (!processedData) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline text-2xl"><ClipboardList className="h-8 w-8 text-primary" />Relatório de Pendências</CardTitle>
                    <CardDescription>Consolide todas as análises num relatório final.</CardDescription>
                </CardHeader>
                <CardContent className="text-center text-muted-foreground p-8">
                    <FileQuestion className="h-12 w-12 mx-auto mb-4" />
                    <p>Execute o processo de validação na primeira aba para gerar o relatório de pendências.</p>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <ClipboardList className="h-8 w-8 text-primary" />
                            <div>
                                <CardTitle className="font-headline text-2xl">Relatório de Pendências</CardTitle>
                                <CardDescription>Consolide todas as análises num relatório final. Exporte o relatório completo ou por secção.</CardDescription>
                            </div>
                        </div>
                        <div className="flex gap-2">
                             <Button onClick={handleForceUpdate} variant="secondary"><RefreshCw className="mr-2 h-4 w-4" />Atualizar Relatório</Button>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline"><Settings className="mr-2 h-4 w-4" />Opções</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                    <div className="grid gap-4">
                                        <div className="space-y-2">
                                            <h4 className="font-medium leading-none">Incluir no Relatório Global</h4>
                                            <p className="text-sm text-muted-foreground">
                                                Selecione as secções a incluir na exportação completa.
                                            </p>
                                        </div>
                                        <div className="grid gap-2">
                                            {sections.map(section => (
                                                <Collapsible key={section.id} open={openCollapsibles.has(section.id)} onOpenChange={() => toggleCollapsible(section.id)}>
                                                    <div className='flex items-center space-x-2'>
                                                         <Checkbox id={`export-${section.id}`} checked={exportOptions[section.id] || false} onCheckedChange={(checked) => handleToggleExportOption(section.id, !!checked, true)} />
                                                        {section.subSections ? (
                                                            <CollapsibleTrigger className='flex items-center gap-1 flex-1'>
                                                                <Label htmlFor={`export-${section.id}`} className='cursor-pointer'>{section.title}</Label>
                                                                {openCollapsibles.has(section.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                            </CollapsibleTrigger>
                                                        ) : (
                                                            <Label htmlFor={`export-${section.id}`}>{section.title}</Label>
                                                        )}
                                                    </div>
                                                    {section.subSections && (
                                                        <CollapsibleContent className='pl-6 mt-2 space-y-2'>
                                                            {section.subSections.map(sub => (
                                                                 <div key={sub.id} className="flex items-center space-x-2">
                                                                    <Checkbox id={`export-${sub.id}`} checked={exportOptions[sub.id] || false} onCheckedChange={(checked) => handleToggleExportOption(sub.id, !!checked, false)} />
                                                                    <Label htmlFor={`export-${sub.id}`}>{sub.title}</Label>
                                                                </div>
                                                            ))}
                                                        </CollapsibleContent>
                                                    )}
                                                </Collapsible>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <Button onClick={() => handleExportAll('excel')}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar Excel</Button>
                            <Button onClick={() => handleExportAll('pdf')} variant="outline"><FileText className="mr-2 h-4 w-4" />Exportar PDF</Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {sections.length === 0 && (
                <Card>
                    <CardContent className="text-center text-muted-foreground py-16">
                        <FileQuestion className="h-12 w-12 mx-auto mb-4" />
                        <p className='text-lg font-medium'>Nenhuma pendência encontrada</p>
                        <p>Todos os dados processados estão em conformidade com as verificações realizadas.</p>
                    </CardContent>
                </Card>
            )}

            {sections.map(section => (
                 <Card key={section.id} className="overflow-hidden">
                     <CardHeader>
                         <div className='flex items-center justify-between'>
                            <div>
                                <CardTitle className="text-xl">{section.title} ({(section.subSections || [section]).reduce((acc, s) => acc + s.data.length, 0)})</CardTitle>
                                <CardDescription className="mt-1">{section.description}</CardDescription>
                            </div>
                             <div className="flex items-center gap-2 shrink-0">
                                <TooltipProvider>
                                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="outline" onClick={() => exportToExcel([section], `Pendencias_${section.id}`)} disabled={(section.subSections || [section]).reduce((acc, s) => acc + s.data.filter(item => !ignoredItems.has(item.__itemKey)).length, 0) === 0}><FileSpreadsheet className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Baixar esta secção (Excel)</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="outline" onClick={() => exportToPdf([section], `Pendencias_${section.id}`)} disabled={(section.subSections || [section]).reduce((acc, s) => acc + s.data.filter(item => !ignoredItems.has(item.__itemKey)).length, 0) === 0}><FileText className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Baixar esta secção (PDF)</p></TooltipContent></Tooltip>
                                </TooltipProvider>
                            </div>
                         </div>
                     </CardHeader>
                    <CardContent>
                        {section.summary && <div className="mb-4 p-4 border rounded-md bg-muted/50">{section.summary}</div>}
                        {section.subSections ? (
                            <Tabs defaultValue={section.subSections[0]?.id} className="w-full">
                                <TabsList>
                                    {section.subSections.map(sub => <TabsTrigger key={sub.id} value={sub.id}>{sub.title} ({sub.data.length})</TabsTrigger>)}
                                </TabsList>
                                {section.subSections.map(sub => (
                                    <TabsContent key={sub.id} value={sub.id} className="mt-4">
                                        {sub.description && (
                                            <div className="text-sm text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                <TooltipProvider><Tooltip><TooltipTrigger asChild><button><HelpCircle className="h-4 w-4"/></button></TooltipTrigger><TooltipContent><p>{sub.description}</p></TooltipContent></Tooltip></TooltipProvider>
                                                <span>{sub.description}</span>
                                            </div>
                                        )}
                                        <DataTable columns={[...sub.columns, memoizedActionColumn]} data={sub.data} />
                                    </TabsContent>
                                ))}
                            </Tabs>
                        ) : (
                            <DataTable columns={[...section.columns, memoizedActionColumn]} data={section.data} />
                        )}
                    </CardContent>
                 </Card>
            ))}
        </div>
    );
}
