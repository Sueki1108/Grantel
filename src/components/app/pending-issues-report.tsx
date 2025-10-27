
"use client";

import * as React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ProcessedData } from '@/lib/excel-processor';
import { ClipboardList, Download, FileQuestion, FileText, File as FileIcon } from 'lucide-react';
import { getColumns } from '@/lib/columns-helper';
import { DataTable } from './data-table';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useToast } from '@/hooks/use-toast';
import { AllClassifications } from './imobilizado-analysis';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';


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
    const [selectedSections, setSelectedSections] = React.useState<Record<string, boolean>>({});
    const [rowSelections, setRowSelections] = React.useState<Record<string, Record<string, boolean>>>({});

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
                description: 'Estes são os itens com valor superior a R$ 1.200,00 que foram manualmente classificados como Ativo Imobilizado. Verifique se o código do ativo está correto.',
                data: imobilizadoItems,
                columns: getColumns(imobilizadoItems)
            });
        }

        // 2. SPED - Não encontrados
        const notFoundInSped = (processedData.keyCheckResults?.keysNotFoundInTxt || []).map(item => ({
             'Resumo da Pendência': 'Chave válida encontrada nos XMLs/planilhas, mas ausente no arquivo SPED.',
             'Chave de Acesso': item.key,
             'Tipo': item.type,
             'Fornecedor': item.Fornecedor,
             'Valor': item.Total,
        }));
        if (notFoundInSped.length > 0) {
            reportSections.push({
                id: 'sped_not_found',
                title: 'Notas Válidas Não Encontradas no SPED',
                description: 'As chaves de acesso abaixo constam como válidas no seu controlo (XMLs e planilhas), mas não foram localizadas no arquivo SPED Fiscal. Isto pode indicar que não foram escrituradas.',
                data: notFoundInSped,
                columns: getColumns(notFoundInSped)
            });
        }

        // 3. SPED - Não na planilha
        const notInSheet = (processedData.keyCheckResults?.keysInTxtNotInSheet || []).map(item => ({
            'Resumo da Pendência': 'Chave encontrada no SPED, mas não pertence às notas válidas para o período (pode ser cancelada, devolução, etc.).',
            'Chave de Acesso': item.key,
            'Tipo': item.type,
            'Fornecedor': item.Fornecedor,
            'Valor': item.Total,
        }));
        if (notInSheet.length > 0) {
            reportSections.push({
                id: 'sped_not_in_sheet',
                title: 'Chaves no SPED Não Encontradas nas Notas Válidas',
                description: 'Estas chaves foram encontradas no arquivo SPED, mas não foram classificadas como válidas no seu controlo. Podem ser notas canceladas, devolvidas ou que não deveriam ter sido escrituradas.',
                data: notInSheet,
                columns: getColumns(notInSheet)
            });
        }

        // 4. SPED - Inconformidades (dividido em sub-secções)
        const { ufDivergences, ieDivergences, dateDivergences, valueDivergences } = processedData.keyCheckResults || {};
        const allDivergences = [
            ...(ufDivergences || []),
            ...(ieDivergences || []),
            ...(dateDivergences || []),
            ...(valueDivergences || []),
        ];

        if (allDivergences.length > 0) {
             const subSections = [
                { id: 'uf', title: 'UF', data: (ufDivergences || []).map(d => ({...d, 'Resumo da Pendência': `UF do destinatário no XML (${d['UF no XML']}) diverge do padrão da empresa.`})), columns: getColumns(ufDivergences || []) },
                { id: 'ie', title: 'IE', data: (ieDivergences || []).map(d => ({...d, 'Resumo da Pendência': `Inscrição Estadual do destinatário no XML (${d['IE no XML']}) diverge do padrão da empresa.`})), columns: getColumns(ieDivergences || []) },
                { id: 'date', title: 'Data', data: (dateDivergences || []).map(d => ({...d, 'Resumo da Pendência': `Data de emissão entre XML (${d['Data Emissão XML']}) e SPED (${d['Data Emissão SPED']}) diverge.`})), columns: getColumns(dateDivergences || []) },
                { id: 'value', title: 'Valor', data: (valueDivergences || []).map(d => ({...d, 'Resumo da Pendência': `Valor total entre XML (${d['Valor XML']}) e SPED (${d['Valor SPED']}) diverge.`})), columns: getColumns(valueDivergences || []) },
            ].filter(sub => sub.data.length > 0);

            if (subSections.length > 0) {
                 reportSections.push({
                    id: 'sped_divergences',
                    title: 'Inconformidades Entre XML e SPED',
                    description: 'Foram encontradas divergências nos dados de notas que constam em ambos os locais (XML e SPED). As inconsistências estão separadas por tipo abaixo.',
                    data: [],
                    columns: [],
                    subSections
                });
            }
        }
        
        // 5. SPED - Modificações
        const spedCorrections = processedData.spedCorrections || [];
         if (spedCorrections.length > 0 && spedCorrections[0].linesModified > 0) {
            const modifications = Object.entries(spedCorrections[0].modifications).flatMap(([key, value]) => {
                if(Array.isArray(value) && value.length > 0) {
                     return value.map((v: any) => ({
                        'Resumo da Pendência': `Correção automática aplicada ao SPED (Tipo: ${key})`,
                        'Linha': v.lineNumber,
                        'Detalhe': `Original: ${v.original || v.line} | Corrigido: ${v.corrected || '(linha removida)'}`,
                    }));
                }
                return [];
            });
            if(modifications.length > 0) {
                reportSections.push({
                    id: 'sped_corrections',
                    title: 'Modificações Realizadas no Arquivo SPED',
                    description: 'O corretor automático realizou as seguintes alterações no arquivo SPED para garantir a conformidade com o validador. Verifique se as correções estão de acordo com o esperado.',
                    data: modifications,
                    columns: getColumns(modifications)
                });
            }
        }

        // 6. CFOP Incorreto/A Verificar
        const cfopValidationItems = processedData.reconciliationResults?.reconciled || [];
        const cfopIncorrectItems = cfopValidationItems.filter(item => {
             const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
             const classification = allPersistedClassifications[competenceKey]?.cfopValidations?.classifications[uniqueKey]?.classification;
             return classification === 'incorrect';
        });

         if (cfopIncorrectItems.length > 0) {
             const cfopReportData = cfopIncorrectItems.map(item => ({
                'Resumo da Pendência': 'O CFOP lançado no Sienge foi manualmente classificado como incorreto ao ser comparado com o XML.',
                'Fornecedor': item.Fornecedor,
                'Número da Nota': item['Número da Nota'],
                'Descrição XML': item['Descrição'],
                'CFOP XML': item.CFOP,
                'CFOP Sienge': item.Sienge_CFOP,
            }));
            reportSections.push({
                id: 'cfop_issues',
                title: 'Itens com Validação de CFOP Incorreta',
                description: 'Os itens abaixo, que foram conciliados entre XML e Sienge, foram marcados como tendo um CFOP incorreto.',
                data: cfopReportData,
                columns: getColumns(cfopReportData)
            });
        }
        
        // 7. Revenda
        const resaleItems = (processedData.resaleAnalysis?.xmls || []).map(f => ({
            'Resumo da Pendência': 'Nota fiscal identificada como operação de revenda, com base no CFOP do Sienge.',
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
    
    React.useEffect(() => {
        const initialSections: Record<string, boolean> = {};
        const initialItems: Record<string, Record<string, boolean>> = {};
        sections.forEach(section => {
            initialSections[section.id] = true;
            
            const dataToSelect = section.data.length > 0 ? section.data : (section.subSections || []).flatMap(s => s.data);
            
            const selection: Record<string, boolean> = {};
            if(dataToSelect.length > 0){
                 dataToSelect.forEach((_, index) => {
                    selection[String(index)] = true;
                });
            }
           
            initialItems[section.id] = selection;
        });
        setSelectedSections(initialSections);
        setRowSelections(initialItems);
    }, [sections]);

    const handleSectionToggle = (sectionId: string, isChecked: boolean) => {
        setSelectedSections(prev => ({ ...prev, [sectionId]: isChecked }));
        const section = sections.find(s => s.id === sectionId);
        if (section) {
            const dataToSelect = section.data.length > 0 ? section.data : (section.subSections || []).flatMap(s => s.data);
            const newSelection: Record<string, boolean> = {};
            if(isChecked) {
                dataToSelect.forEach((_, index) => {
                    newSelection[String(index)] = true;
                });
            }
            setRowSelections(prev => ({...prev, [sectionId]: newSelection}));
        }
    };

    const exportToExcel = (sectionsToExport: Section[]) => {
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
             toast({ variant: 'destructive', title: 'Nenhuma pendência selecionada' });
            return;
        }

        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'Relatorio_Pendencias_Fiscais.xlsx');
        toast({ title: 'Relatório Excel Gerado' });
    };

    const exportToPdf = (sectionsToExport: Section[], reportTitle: string) => {
        const doc = new jsPDF({
            orientation: 'landscape',
        });
        
        let isFirstPage = true;

        sectionsToExport.forEach(section => {
            const processSectionData = (data: any[], columns: any[], title: string) => {
                 if (data.length === 0) return;

                if (!isFirstPage) {
                    doc.addPage();
                }

                doc.setFontSize(14);
                doc.text(title, 14, 20);

                const tableColumns = columns.map((col: any) => col.accessorKey || col.id).filter((key: any) => key !== 'select');
                const tableRows = data.map(row => {
                    return tableColumns.map((colName: string) => {
                        let value = row[colName];
                        if (value instanceof Date) return value.toLocaleDateString('pt-BR');
                        if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
                        if (value === null || value === undefined) return '';
                        return String(value);
                    });
                });

                autoTable(doc, {
                    head: [tableColumns],
                    body: tableRows,
                    startY: 28,
                    theme: 'striped',
                    headStyles: { fillColor: [41, 128, 185], cellPadding: 2, halign: 'center' },
                    styles: { fontSize: 7, cellPadding: 1, overflow: 'linebreak' },
                    columnStyles: tableColumns.reduce((acc: any, col: any) => {
                        acc[col] = { cellWidth: 'auto' };
                        return acc;
                    }, {})
                });
                
                isFirstPage = false;
            }

            if (section.subSections) {
                 section.subSections.forEach(sub => processSectionData(sub.data, sub.columns, `${section.title}: ${sub.title}`));
            } else {
                 processSectionData(section.data, section.columns, section.title);
            }
        });

        if (isFirstPage) { // No data was added
            toast({ variant: 'destructive', title: 'Nenhuma pendência selecionada' });
            return;
        }

        doc.save(`${reportTitle}.pdf`);
        toast({ title: 'Relatório PDF Gerado' });
    };

    const handleExport = (format: 'excel' | 'pdf') => {
        const sectionsToExport = sections.map(section => {
            const selectedIndices = Object.keys(rowSelections[section.id] || {}).filter(key => rowSelections[section.id][key]).map(Number);
            
            if (section.subSections) {
                let flatData: any[] = [];
                const newSubSections = section.subSections.map(sub => {
                    const subData = sub.data.filter((_, index) => selectedIndices.includes(flatData.length + index));
                    flatData = [...flatData, ...sub.data];
                    return {...sub, data: subData};
                }).filter(sub => sub.data.length > 0);
                
                return {
                    ...section,
                    subSections: newSubSections
                };
            }
            
            return {
                ...section,
                data: section.data.filter((_, index) => selectedIndices.includes(index)),
            };
        }).filter(section => {
            if (section.subSections) return section.subSections.length > 0;
            return section.data.length > 0;
        });

        if (sectionsToExport.length === 0) {
            toast({ variant: 'destructive', title: 'Nenhuma pendência selecionada', description: 'Selecione pelo menos um item para exportar.'});
            return;
        }

        if (format === 'excel') {
            exportToExcel(sectionsToExport);
        } else {
            exportToPdf(sectionsToExport, 'Relatorio_Pendencias_Fiscais');
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
    
    const totalSelectedItems = Object.values(rowSelections).reduce((acc, currentSelection) => acc + Object.keys(currentSelection).filter(key => currentSelection[key]).length, 0);

    return (
        <Card>
            <CardHeader>
                 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                         <ClipboardList className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Relatório de Pendências</CardTitle>
                            <CardDescription>Consolide todas as análises num relatório final. Selecione as pendências que deseja exportar.</CardDescription>
                        </div>
                    </div>
                     <div className="flex gap-2">
                        <Button onClick={() => handleExport('excel')} disabled={totalSelectedItems === 0}>
                            <Download className="mr-2 h-4 w-4" /> Exportar Seleção (Excel)
                        </Button>
                        <Button onClick={() => handleExport('pdf')} variant="outline" disabled={totalSelectedItems === 0}>
                            <FileIcon className="mr-2 h-4 w-4" /> Exportar Seleção (PDF)
                        </Button>
                     </div>
                </div>
            </CardHeader>
            <CardContent>
                <Accordion type="multiple" defaultValue={sections.map(s => s.id)} className="w-full">
                    {sections.map(section => {
                        const isSectionChecked = selectedSections[section.id] || false;
                        const dataForSelection = section.data.length > 0 ? section.data : (section.subSections || []).flatMap(s => s.data);
                        const selectedCount = Object.keys(rowSelections[section.id] || {}).filter(key => rowSelections[section.id][key]).length;

                        return (
                            <AccordionItem value={section.id} key={section.id} className="border-b-0 mb-4 rounded-lg overflow-hidden border">
                                <AccordionTrigger className="p-4 bg-muted/50 hover:no-underline data-[state=closed]:rounded-b-lg">
                                    <div className="flex items-center space-x-3 w-full">
                                        <Checkbox
                                            id={`section-${section.id}`}
                                            checked={isSectionChecked}
                                            onCheckedChange={(checked) => handleSectionToggle(section.id, !!checked)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <Label htmlFor={`section-${section.id}`} className="text-lg font-semibold flex-grow cursor-pointer text-left">
                                            {section.title} ({selectedCount} / {dataForSelection.length})
                                        </Label>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-4 border-t">
                                    <p className='text-sm text-muted-foreground mb-4'>{section.description}</p>
                                    
                                    {section.subSections ? (
                                        <Tabs defaultValue={section.subSections[0]?.id}>
                                            <TabsList>
                                                {section.subSections.map(sub => <TabsTrigger key={sub.id} value={sub.id}>{sub.title} ({sub.data.length})</TabsTrigger>)}
                                            </TabsList>
                                            {section.subSections.map(sub => (
                                                <TabsContent key={sub.id} value={sub.id} className="mt-4">
                                                     <div className="flex gap-2 mb-2">
                                                        <Button onClick={() => exportToExcel(sub.data, `${section.id}_${sub.id}`)} size="sm" variant="outline" disabled={sub.data.length === 0}><Download className="mr-2 h-4"/>Excel</Button>
                                                        <Button onClick={() => exportToPdf(sub.data, sub.columns, `${section.title}: ${sub.title}`)} size="sm" variant="outline" disabled={sub.data.length === 0}><FileText className="mr-2 h-4"/>PDF</Button>
                                                    </div>
                                                    <DataTable columns={sub.columns} data={sub.data} />
                                                </TabsContent>
                                            ))}
                                        </Tabs>
                                    ) : (
                                         <div className="flex gap-2 mb-2">
                                            <Button onClick={() => exportToExcel(section.data, section.id)} size="sm" variant="outline" disabled={section.data.length === 0}><Download className="mr-2 h-4"/>Excel</Button>
                                            <Button onClick={() => exportToPdf(section.data, section.columns, section.title)} size="sm" variant="outline" disabled={section.data.length === 0}><FileText className="mr-2 h-4"/>PDF</Button>
                                        </div>
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                     {sections.length === 0 && (
                        <div className="text-center text-muted-foreground py-16">
                            <FileQuestion className="h-12 w-12 mx-auto mb-4" />
                            <p className='text-lg font-medium'>Nenhuma pendência encontrada</p>
                            <p>Todos os dados processados estão em conformidade com as verificações realizadas.</p>
                        </div>
                    )}
                </Accordion>
            </CardContent>
        </Card>
    );
}
