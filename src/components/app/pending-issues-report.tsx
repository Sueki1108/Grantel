"use client";

import * as React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProcessedData } from '@/lib/excel-processor';
import { ClipboardList, Download, FileQuestion, FileText, FileDown, FileSpreadsheet, EyeOff, Settings, Check, ListFilter, Eye } from 'lucide-react';
import { getColumns } from '@/lib/columns-helper';
import { DataTable } from './data-table';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { AllClassifications } from './imobilizado-analysis';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';


interface Section {
    id: string;
    title: string;
    description: string;
    data: any[];
    columns: any[];
    subSections?: {
        id: string;
        title: string;
        description: string;
        data: any[];
        columns: any[];
    }[]
}

interface PendingIssuesReportProps {
    processedData: ProcessedData | null;
    allPersistedClassifications: AllClassifications;
}

export function PendingIssuesReport({ processedData, allPersistedClassifications }: PendingIssuesReportProps) {
    const { toast } = useToast();
    const [ignoredItems, setIgnoredItems] = React.useState<Set<string>>(new Set());
    const [exportOptions, setExportOptions] = React.useState<Record<string, boolean>>({});


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
                const classification = allPersistedClassifications[competenceKey]?.classifications?.[item.uniqueItemId]?.classification;
                return classification === 'imobilizado';
            })
            .map(item => {
                const persistedForCompetence = allPersistedClassifications[competenceKey];
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

        if (imobilizadoItems.length > 0) {
            reportSections.push({
                id: 'imobilizado',
                title: 'Itens Classificados como Ativo Imobilizado',
                description: 'Itens com valor > R$ 1.200,00 classificados manualmente como Ativo Imobilizado. Verifique se o código do ativo está correto.',
                data: imobilizadoItems,
                columns: getColumns(imobilizadoItems)
            });
        }

        // 2. Notas não Lançadas
        const notFoundInSped = (processedData.keyCheckResults?.keysNotFoundInTxt || []);
        const notFoundNfe = notFoundInSped.filter(item => (item.type === 'NFE' || item.type === 'Saída')).map(item => ({...item, '__itemKey': `notfound-${item.key}`}));
        const notFoundCte = notFoundInSped.filter(item => item.type === 'CTE').map(item => ({...item, '__itemKey': `notfound-${item.key}`}));

        if (notFoundInSped.length > 0) {
            reportSections.push({
                id: 'sped_not_found',
                title: 'Notas não Lançadas',
                description: 'As chaves abaixo constam como válidas no seu controlo, mas não foram localizadas no arquivo SPED, indicando que podem não ter sido escrituradas.',
                data: [],
                columns: [],
                subSections: [
                    { id: 'nfe_not_found', title: 'NF-e', description: '', data: notFoundNfe, columns: getColumns(notFoundNfe)},
                    { id: 'cte_not_found', title: 'CT-e', description: '', data: notFoundCte, columns: getColumns(notFoundCte)}
                ]
            });
        }

        // 3. SPED - Não na planilha
        const notInSheet = (processedData.keyCheckResults?.keysInTxtNotInSheet || []).map(item => ({ ...item, '__itemKey': `notinSheet-${item.key}` }));
        if (notInSheet.length > 0) {
            reportSections.push({
                id: 'sped_not_in_sheet',
                title: 'Chaves no SPED Não Encontradas nas Notas Válidas',
                description: 'Estas chaves existem no SPED, mas não foram classificadas como válidas no seu controlo. Verifique se são notas canceladas, devolvidas ou escrituradas indevidamente.',
                data: notInSheet,
                columns: getColumns(notInSheet)
            });
        }

        // 4. SPED - Inconformidades (dividido em sub-secções)
        const { ufDivergences, ieDivergences, dateDivergences, valueDivergences } = processedData.keyCheckResults || {};
        
        if ((ufDivergences?.length || 0) > 0 || (ieDivergences?.length || 0) > 0 || (dateDivergences?.length || 0) > 0 || (valueDivergences?.length || 0) > 0) {
            const subSections = [
                { id: 'uf', title: 'Divergência de UF', description: 'Inconsistência entre a UF do destinatário no XML e o cadastro da empresa.', data: (ufDivergences || []).map(item => ({...item, '__itemKey': `uf-${item['Chave de Acesso']}`})), columns: getColumns(ufDivergences || []) },
                { id: 'ie', title: 'Divergência de IE', description: 'Inconsistência entre a Inscrição Estadual do destinatário no XML e o cadastro da empresa.', data: (ieDivergences || []).map(item => ({...item, '__itemKey': `ie-${item['Chave de Acesso']}`})), columns: getColumns(ieDivergences || []) },
                { id: 'date', title: 'Divergência de Data', description: 'A data de emissão do documento no XML não corresponde à data de emissão escriturada no SPED.', data: (dateDivergences || []).map(item => ({...item, '__itemKey': `date-${item['Chave de Acesso']}`})), columns: getColumns(dateDivergences || []) },
                { id: 'value', title: 'Divergência de Valor', description: 'O valor total do documento no XML não corresponde ao valor total escriturado no SPED.', data: (valueDivergences || []).map(item => ({...item, '__itemKey': `value-${item['Chave de Acesso']}`})), columns: getColumns(valueDivergences || []) },
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
        
        // 5. SPED - Modificações
        const spedCorrections = processedData.spedCorrections || [];
         if (spedCorrections.length > 0 && spedCorrections[0].linesModified > 0) {
            const modifications = Object.entries(spedCorrections[0].modifications).flatMap(([key, value]) => {
                if(Array.isArray(value) && value.length > 0) {
                     return value.map((v: any, i: number) => ({
                        'Tipo de Correção': key,
                        'Linha': v.lineNumber,
                        'Detalhe': `Original: ${v.original || v.line} | Corrigido: ${v.corrected || '(removida)'}`,
                        '__itemKey': `spedmod-${key}-${i}`
                    }));
                }
                return [];
            });
            if(modifications.length > 0) {
                reportSections.push({
                    id: 'sped_corrections',
                    title: 'Modificações Realizadas no Arquivo SPED',
                    description: 'O corretor automático realizou as seguintes alterações no arquivo SPED para garantir a conformidade.',
                    data: modifications,
                    columns: getColumns(modifications)
                });
            }
        }

        // 6. CFOP Incorreto ou a Verificar
        const cfopValidationItems = processedData.reconciliationResults?.reconciled || [];
        const cfopPendingItems = cfopValidationItems.filter(item => {
             const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
             const classification = allPersistedClassifications[competenceKey]?.cfopValidations?.classifications[uniqueKey]?.classification;
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

            const cfopSubSections = Object.entries(groupedByCfop).map(([cfop, items]) => ({
                id: `cfop_pending_${cfop}`,
                title: `CFOP ${cfop}`,
                description: `Itens lançados no Sienge com CFOP ${cfop} que foram marcados como incorretos ou a verificar.`,
                data: items,
                columns: getColumns(items)
            }));

            reportSections.push({
                id: 'cfop_issues',
                title: 'Itens com Validação de CFOP Pendente',
                description: 'Itens conciliados que foram marcados manualmente como "Incorreto" ou "A Verificar".',
                data: [],
                columns: [],
                subSections: cfopSubSections
            });
        }
        
        // 7. Revenda
        const resaleItems = (processedData.resaleAnalysis?.xmls || []).map((f, i) => ({
            'Ficheiro XML de Revenda': f.name,
            '__itemKey': `resale-${i}`
        }));
         if (resaleItems.length > 0) {
            reportSections.push({
                id: 'resale_items',
                title: 'Notas Fiscais de Revenda Identificadas',
                description: 'Os seguintes XMLs foram identificados como operações de revenda, com base nos CFOPs correspondentes na planilha do Sienge.',
                data: resaleItems,
                columns: getColumns(resaleItems)
            });
        }


        return reportSections;
    }, [processedData, allPersistedClassifications]);

    React.useEffect(() => {
        const initialOptions: Record<string, boolean> = {};
        sections.forEach(s => { initialOptions[s.id] = true; });
        setExportOptions(initialOptions);
    }, [sections]);

    const handleToggleExportOption = (sectionId: string, checked: boolean) => {
        setExportOptions(prev => ({...prev, [sectionId]: checked}));
    };

    const exportToExcel = (sectionsToExport: Section[], fileName: string) => {
        const workbook = XLSX.utils.book_new();

        sectionsToExport.forEach(section => {
            if (section.subSections && section.subSections.length > 0) {
                section.subSections.forEach(sub => {
                     const exportData = sub.data.filter(item => !ignoredItems.has(item.__itemKey)).map(({__itemKey, ...rest}) => rest);
                     if (exportData.length > 0) {
                        const worksheet = XLSX.utils.json_to_sheet(exportData);
                        const sheetName = sub.title.replace(/[:\\/?*[\]]/g, '').substring(0, 31);
                        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                    }
                })
            } else {
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
        
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${fileName}.xlsx`;
        link.click();
        URL.revokeObjectURL(link.href);

        toast({ title: 'Relatório Excel Gerado' });
    };

    const exportToPdf = (sectionsToExport: Section[], reportTitle: string) => {
        const doc = new jsPDF({ orientation: 'landscape' });
        
        let isFirstPage = true;

        sectionsToExport.forEach(section => {
            const processSectionData = (data: any[], columns: any[], title: string) => {
                 const exportData = data.filter(item => !ignoredItems.has(item.__itemKey)).map(({__itemKey, ...rest}) => rest);
                 if (exportData.length === 0) return;

                if (!isFirstPage) doc.addPage();
                isFirstPage = false;

                doc.setFontSize(14);
                doc.text(title, 14, 20);

                const tableColumns = columns.map((col: any) => col.accessorKey || col.id).filter((key: any) => !['select', '__itemKey', 'actions'].includes(key));
                const tableRows = exportData.map(row => tableColumns.map((colName: string) => String(row[colName] ?? '')));

                autoTable(doc, {
                    head: [tableColumns],
                    body: tableRows,
                    startY: 28,
                    theme: 'striped',
                    headStyles: { fillColor: [41, 128, 185], cellPadding: 2, halign: 'center', minCellHeight: 10 },
                    styles: { fontSize: 7, cellPadding: 1, overflow: 'linebreak' },
                    columnStyles: { 0: { cellWidth: 'auto' } }
                });
            }

            if (section.subSections) {
                 section.subSections.forEach(sub => processSectionData(sub.data, sub.columns, `${section.title}: ${sub.title}`));
            } else {
                 processSectionData(section.data, section.columns, section.title);
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
        const selectedSections = sections.filter(s => exportOptions[s.id]);
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
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline"><Settings className="mr-2 h-4 w-4" />Opções de Exportação</Button>
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
                                                <div key={section.id} className="flex items-center justify-between">
                                                    <Label htmlFor={`export-${section.id}`}>{section.title}</Label>
                                                    <Checkbox id={`export-${section.id}`} checked={exportOptions[section.id]} onCheckedChange={(checked) => handleToggleExportOption(section.id, !!checked)} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <Button onClick={() => handleExportAll('excel')}><Download className="mr-2 h-4 w-4" />Exportar Seleção (Excel)</Button>
                            <Button onClick={() => handleExportAll('pdf')} variant="outline"><FileText className="mr-2 h-4 w-4" />Exportar Seleção (PDF)</Button>
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

            <Accordion type="multiple" className="w-full space-y-4">
                {sections.map(section => (
                    <AccordionItem value={section.id} key={section.id} className="border-b-0">
                         <Card className="overflow-hidden">
                             <AccordionTrigger className="w-full hover:no-underline">
                                 <CardHeader className="flex-row items-center justify-between w-full pb-0">
                                    <div>
                                        <CardTitle className="text-xl">{section.title} ({(section.subSections || [section]).reduce((acc, s) => acc + s.data.length, 0)})</CardTitle>
                                    </div>
                                </CardHeader>
                             </AccordionTrigger>
                            <AccordionContent>
                                <CardContent>
                                     <div className='flex items-center justify-between mb-4'>
                                        <p className="text-sm text-muted-foreground">{section.description}</p>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <TooltipProvider>
                                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant="outline" onClick={() => exportToExcel([section], `Pendencias_${section.id}`)} disabled={(section.subSections || [section]).reduce((acc, s) => acc + s.data.filter(item => !ignoredItems.has(item.__itemKey)).length, 0) === 0}><FileSpreadsheet className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Baixar esta secção (Excel)</p></TooltipContent></Tooltip>
                                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant="outline" onClick={() => exportToPdf([section], `Pendencias_${section.id}`)} disabled={(section.subSections || [section]).reduce((acc, s) => acc + s.data.filter(item => !ignoredItems.has(item.__itemKey)).length, 0) === 0}><FileText className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Baixar esta secção (PDF)</p></TooltipContent></Tooltip>
                                            </TooltipProvider>
                                        </div>
                                    </div>
                                    
                                    {section.subSections ? (
                                        <Tabs defaultValue={section.subSections[0]?.id} className="w-full">
                                            <TabsList>
                                                {section.subSections.map(sub => <TabsTrigger key={sub.id} value={sub.id}>{sub.title} ({sub.data.length})</TabsTrigger>)}
                                            </TabsList>
                                            {section.subSections.map(sub => (
                                                <TabsContent key={sub.id} value={sub.id} className="mt-4">
                                                    {sub.description && <p className="text-sm text-muted-foreground mb-4">{sub.description}</p>}
                                                    <DataTable columns={[...sub.columns.filter((c:any) => c.id !== '__itemKey'), { id: 'actions', cell: ({row}: any) => { const itemKey = row.original.__itemKey; return <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleIgnoredItem(itemKey)}><TooltipProvider><Tooltip><TooltipTrigger asChild><span>{ignoredItems.has(itemKey) ? <Eye className='h-4 w-4 text-green-600'/> : <EyeOff className='h-4 w-4'/>}</span></TooltipTrigger><TooltipContent><p>{ignoredItems.has(itemKey) ? "Re-incluir na exportação" : "Ignorar na exportação"}</p></TooltipContent></Tooltip></TooltipProvider></Button> }}]} data={sub.data} />
                                                </TabsContent>
                                            ))}
                                        </Tabs>
                                    ) : (
                                        <DataTable columns={[...section.columns.filter((c:any) => c.id !== '__itemKey'), { id: 'actions', cell: ({row}: any) => { const itemKey = row.original.__itemKey; return <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleIgnoredItem(itemKey)}><TooltipProvider><Tooltip><TooltipTrigger asChild><span>{ignoredItems.has(itemKey) ? <Eye className='h-4 w-4 text-green-600'/> : <EyeOff className='h-4 w-4'/>}</span></TooltipTrigger><TooltipContent><p>{ignoredItems.has(itemKey) ? "Re-incluir na exportação" : "Ignorar na exportação"}</p></TooltipContent></Tooltip></TooltipProvider></Button> }}]} data={section.data} />
                                    )}
                                </CardContent>
                             </AccordionContent>
                         </Card>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    );
}
