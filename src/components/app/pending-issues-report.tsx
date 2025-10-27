
"use client";

import * as React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProcessedData } from '@/lib/excel-processor';
import { ClipboardList, Download, FileQuestion, FileText, FileDown, FileSpreadsheet } from 'lucide-react';
import { getColumns } from '@/lib/columns-helper';
import { DataTable } from './data-table';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useToast } from '@/hooks/use-toast';
import { AllClassifications } from './imobilizado-analysis';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip';


interface Section {
    id: string;
    title: string;
    description: string;
    data: any[];
    columns: any[];
    subSections?: {
        id: string;
        title: string;
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
            
             return {
                'Número da Nota': item['Número da Nota'],
                'Descrição': item['Descrição'],
                'Fornecedor': item['Fornecedor'],
                'Valor Total': item['Valor Total'],
                'Código do Ativo': accountCode || '(não definido)',
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

        // 2. SPED - Não encontrados
        const notFoundInSped = (processedData.keyCheckResults?.keysNotFoundInTxt || []).map(item => ({
             'Chave de Acesso': item.key,
             'Tipo': item.type,
             'Fornecedor': item.Fornecedor,
             'Valor': item.Total,
        }));
        if (notFoundInSped.length > 0) {
            reportSections.push({
                id: 'sped_not_found',
                title: 'Notas Válidas Não Encontradas no SPED',
                description: 'As chaves abaixo constam como válidas no seu controlo, mas não foram localizadas no arquivo SPED, indicando que podem não ter sido escrituradas.',
                data: notFoundInSped,
                columns: getColumns(notFoundInSped)
            });
        }

        // 3. SPED - Não na planilha
        const notInSheet = (processedData.keyCheckResults?.keysInTxtNotInSheet || []).map(item => ({
            'Chave de Acesso': item.key,
            'Tipo': item.type,
            'Fornecedor': item.Fornecedor,
            'Valor': item.Total,
        }));
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
                { id: 'uf', title: 'UF', data: (ufDivergences || []), columns: getColumns(ufDivergences || []) },
                { id: 'ie', title: 'IE', data: (ieDivergences || []), columns: getColumns(ieDivergences || []) },
                { id: 'date', title: 'Data', data: (dateDivergences || []), columns: getColumns(dateDivergences || []) },
                { id: 'value', title: 'Valor', data: (valueDivergences || []), columns: getColumns(valueDivergences || []) },
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
                     return value.map((v: any) => ({
                        'Tipo de Correção': key,
                        'Linha': v.lineNumber,
                        'Detalhe': `Original: ${v.original || v.line} | Corrigido: ${v.corrected || '(removida)'}`,
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

        // 6. CFOP Incorreto/A Verificar
        const cfopValidationItems = processedData.reconciliationResults?.reconciled || [];
        const cfopIncorrectOrVerifyItems = cfopValidationItems.filter(item => {
             const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
             const classification = allPersistedClassifications[competenceKey]?.cfopValidations?.classifications[uniqueKey]?.classification;
             return classification === 'incorrect' || classification === 'verify';
        });

         if (cfopIncorrectOrVerifyItems.length > 0) {
             const cfopReportData = cfopIncorrectOrVerifyItems.map(item => ({
                'Status': allPersistedClassifications[competenceKey]?.cfopValidations?.classifications[`${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`]?.classification || '',
                'Fornecedor': item.Fornecedor,
                'Número da Nota': item['Número da Nota'],
                'Descrição XML': item['Descrição'],
                'CFOP XML': item.CFOP,
                'CFOP Sienge': item.Sienge_CFOP,
            }));
            reportSections.push({
                id: 'cfop_issues',
                title: 'Itens com Validação de CFOP Pendente',
                description: 'Itens conciliados entre XML e Sienge que foram marcados manualmente como "Incorreto" ou "A Verificar".',
                data: cfopReportData,
                columns: getColumns(cfopReportData)
            });
        }
        
        // 7. Revenda
        const resaleItems = (processedData.resaleAnalysis?.xmls || []).map(f => ({
            'Ficheiro XML de Revenda': f.name,
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

    const exportToExcel = (sectionsToExport: Section[], fileName: string) => {
        const workbook = XLSX.utils.book_new();

        sectionsToExport.forEach(section => {
            if (section.subSections && section.subSections.length > 0) {
                section.subSections.forEach(sub => {
                     const exportData = sub.data;
                     if (exportData.length > 0) {
                        const worksheet = XLSX.utils.json_to_sheet(exportData);
                        const sheetName = sub.title.replace(/[:\\/?*[\]]/g, '').substring(0, 31);
                        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                    }
                })
            } else {
                 const exportData = section.data;
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
        saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `${fileName}.xlsx`);
        toast({ title: 'Relatório Excel Gerado' });
    };

    const exportToPdf = (sectionsToExport: Section[], reportTitle: string) => {
        const doc = new jsPDF({ orientation: 'landscape' });
        
        let isFirstPage = true;

        sectionsToExport.forEach(section => {
            const processSectionData = (data: any[], columns: any[], title: string) => {
                 if (data.length === 0) return;
                if (!isFirstPage) doc.addPage();

                doc.setFontSize(14);
                doc.text(title, 14, 20);

                const tableColumns = columns.map((col: any) => col.accessorKey || col.id).filter((key: any) => key !== 'select');
                const tableRows = data.map(row => tableColumns.map((colName: string) => String(row[colName] ?? '')));

                autoTable(doc, {
                    head: [tableColumns],
                    body: tableRows,
                    startY: 28,
                    theme: 'striped',
                    headStyles: { fillColor: [41, 128, 185], cellPadding: 2, halign: 'center' },
                    styles: { fontSize: 7, cellPadding: 1, overflow: 'linebreak' },
                    columnStyles: { 0: { cellWidth: 'auto' } }
                });
                
                isFirstPage = false;
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
        if (format === 'excel') {
            exportToExcel(sections, 'Relatorio_Completo_Pendencias');
        } else {
            exportToPdf(sections, 'Relatorio_Completo_Pendencias');
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
                            <Button onClick={() => handleExportAll('excel')}><Download className="mr-2 h-4 w-4" /> Exportar Tudo (Excel)</Button>
                            <Button onClick={() => handleExportAll('pdf')} variant="outline"><FileText className="mr-2 h-4 w-4" /> Exportar Tudo (PDF)</Button>
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
                    <CardHeader className="bg-muted/30">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                            <div>
                                <CardTitle className="text-xl">{section.title} ({(section.subSections || [section]).reduce((acc, s) => acc + s.data.length, 0)})</CardTitle>
                                <CardDescription className="mt-1">{section.description}</CardDescription>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <TooltipProvider>
                                    <Tooltip><TooltipTrigger asChild>
                                        <Button size="icon" variant="outline" onClick={() => exportToExcel([section], `Pendencias_${section.id}`)} disabled={(section.subSections || [section]).reduce((acc, s) => acc + s.data.length, 0) === 0}><FileSpreadsheet className="h-4 w-4" /></Button>
                                    </TooltipTrigger><TooltipContent><p>Baixar esta secção (Excel)</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild>
                                        <Button size="icon" variant="outline" onClick={() => exportToPdf([section], `Pendencias_${section.id}`)} disabled={(section.subSections || [section]).reduce((acc, s) => acc + s.data.length, 0) === 0}><FileText className="h-4 w-4" /></Button>
                                    </TooltipTrigger><TooltipContent><p>Baixar esta secção (PDF)</p></TooltipContent></Tooltip>
                                </TooltipProvider>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {section.subSections ? (
                            <Tabs defaultValue={section.subSections[0]?.id} className="w-full">
                                <TabsList className="m-4">
                                    {section.subSections.map(sub => <TabsTrigger key={sub.id} value={sub.id}>{sub.title} ({sub.data.length})</TabsTrigger>)}
                                </TabsList>
                                {section.subSections.map(sub => (
                                    <TabsContent key={sub.id} value={sub.id} className="mt-0 p-4 pt-0">
                                        <DataTable columns={sub.columns} data={sub.data} />
                                    </TabsContent>
                                ))}
                            </Tabs>
                        ) : (
                            <div className="p-4">
                                <DataTable columns={section.columns} data={section.data} />
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
