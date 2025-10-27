
"use client";

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ProcessedData } from '@/lib/excel-processor';
import { ClipboardList, Download, FileQuestion } from 'lucide-react';
import { getColumns } from '@/lib/columns-helper';
import { DataTable } from './data-table';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { useToast } from '@/hooks/use-toast';
import { AllClassifications } from './imobilizado-analysis';


interface Section {
    id: string;
    title: string;
    data: any[];
    columns: any[];
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

        // 1. Imobilizado
        const imobilizadoItems = (processedData.sheets?.['Imobilizados'] || []).map(item => {
             const competenceKey = processedData.competence || 'default';
             const persistedForCompetence = allPersistedClassifications[competenceKey];
             const classification = persistedForCompetence?.classifications?.[item.uniqueItemId]?.classification;
             const accountCode = persistedForCompetence?.accountCodes?.[item.id]?.accountCode;
            
             return {
                ...item,
                'Resumo da Pendência': `Classificado como '${classification}'. Código do Ativo: ${accountCode || '(não definido)'}`,
             };
        }).filter(item => {
            const competenceKey = processedData.competence || 'default';
            const classification = allPersistedClassifications[competenceKey]?.classifications?.[item.uniqueItemId]?.classification;
            return classification === 'imobilizado';
        });

        if (imobilizadoItems.length > 0) {
            reportSections.push({
                id: 'imobilizado',
                title: 'Itens Classificados como Ativo Imobilizado',
                data: imobilizadoItems,
                columns: getColumns(imobilizadoItems)
            });
        }

        // 2. SPED - Não encontrados
        const notFoundInSped = (processedData.keyCheckResults?.keysNotFoundInTxt || []).map(item => ({
            ...item,
            'Resumo da Pendência': 'Chave de Acesso válida na planilha, mas não foi encontrada no arquivo SPED.'
        }));
        if (notFoundInSped.length > 0) {
            reportSections.push({
                id: 'sped_not_found',
                title: 'Notas Válidas Não Encontradas no SPED',
                data: notFoundInSped,
                columns: getColumns(notFoundInSped)
            });
        }

        // 3. SPED - Não na planilha
        const notInSheet = (processedData.keyCheckResults?.keysInTxtNotInSheet || []).map(item => ({
            ...item,
            'Resumo da Pendência': 'Chave de Acesso encontrada no SPED, mas não na lista de Notas Válidas.'
        }));
        if (notInSheet.length > 0) {
            reportSections.push({
                id: 'sped_not_in_sheet',
                title: 'Chaves no SPED Não Encontradas nas Notas Válidas',
                data: notInSheet,
                columns: getColumns(notInSheet)
            });
        }

        // 4. SPED - Inconformidades
        const spedDivergences = (processedData.keyCheckResults?.consolidatedDivergences || []).map(item => ({
            ...item,
            'Resumo da Pendência': item['Resumo das Divergências']
        }));
        if (spedDivergences.length > 0) {
            reportSections.push({
                id: 'sped_divergences',
                title: 'Inconformidades Encontradas no SPED',
                data: spedDivergences,
                columns: getColumns(spedDivergences)
            });
        }
        
        // 5. SPED - Modificações
        const spedCorrections = processedData.spedCorrections || [];
         if (spedCorrections.length > 0 && spedCorrections[0].linesModified > 0) {
            const modifications = Object.entries(spedCorrections[0].modifications).flatMap(([key, value]) => {
                if(Array.isArray(value) && value.length > 0) {
                     return value.map(v => ({
                        'Resumo da Pendência': `Tipo: ${key}. Linha: ${v.lineNumber}. Original: ${v.original}. Corrigido: ${v.corrected || v.line}`,
                        ...v
                    }));
                }
                return [];
            });
            if(modifications.length > 0) {
                reportSections.push({
                    id: 'sped_corrections',
                    title: 'Modificações Realizadas no Arquivo SPED',
                    data: modifications,
                    columns: getColumns(modifications)
                });
            }
        }


        // 6. CFOP Incorreto/A Verificar
        const cfopValidationItems = processedData.reconciliationResults?.reconciled || [];
        const cfopIssues = cfopValidationItems.map(item => {
             const competenceKey = processedData.competence || 'default';
             const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
             const classification = allPersistedClassifications[competenceKey]?.cfopValidations?.classifications[uniqueKey]?.classification;
             return {
                 ...item,
                 'Resumo da Pendência': `Status da Validação: ${classification}`
             }
        }).filter(item => {
             const competenceKey = processedData.competence || 'default';
             const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
             const classification = allPersistedClassifications[competenceKey]?.cfopValidations?.classifications[uniqueKey]?.classification;
             return classification === 'incorrect' || classification === 'verify';
        });
         if (cfopIssues.length > 0) {
            reportSections.push({
                id: 'cfop_issues',
                title: 'Itens com Validação de CFOP Pendente (Incorreto/A Verificar)',
                data: cfopIssues,
                columns: getColumns(cfopIssues)
            });
        }
        
        // 7. Revenda
        const resaleItems = (processedData.resaleAnalysis?.xmls || []).map(f => ({
            'Ficheiro XML de Revenda': f.name,
            'Resumo da Pendência': 'Nota fiscal identificada como operação de revenda.'
        }));
         if (resaleItems.length > 0) {
            reportSections.push({
                id: 'resale_items',
                title: 'Notas Fiscais de Revenda Identificadas',
                data: resaleItems,
                columns: getColumns(resaleItems)
            });
        }


        return reportSections;
    }, [processedData, allPersistedClassifications]);
    
    // Initialize selection state when sections are calculated
    React.useEffect(() => {
        const initialSections: Record<string, boolean> = {};
        const initialItems: Record<string, Record<string, boolean>> = {};
        sections.forEach(section => {
            initialSections[section.id] = true;
            const selection: Record<string, boolean> = {};
            section.data.forEach((_, index) => {
                selection[String(index)] = true;
            });
            initialItems[section.id] = selection;
        });
        setSelectedSections(initialSections);
        setRowSelections(initialItems);
    }, [sections]);

    const handleSectionToggle = (sectionId: string, isChecked: boolean) => {
        setSelectedSections(prev => ({ ...prev, [sectionId]: isChecked }));
        const section = sections.find(s => s.id === sectionId);
        if (section) {
            const newSelection: Record<string, boolean> = {};
            if(isChecked) {
                section.data.forEach((_, index) => {
                    newSelection[String(index)] = true;
                });
            }
            setRowSelections(prev => ({...prev, [sectionId]: newSelection}));
        }
    };

    const handleExport = () => {
        const workbook = XLSX.utils.book_new();

        sections.forEach(section => {
            const isSectionSelected = selectedSections[section.id];
            if (!isSectionSelected) return;

            const selectedIndices = Object.keys(rowSelections[section.id] || {}).filter(key => rowSelections[section.id][key]).map(Number);
            const dataToExport = section.data.filter((_, index) => selectedIndices.includes(index));

            if (dataToExport.length > 0) {
                const worksheet = XLSX.utils.json_to_sheet(dataToExport);
                // Sanitize sheet name
                const sheetName = section.title.replace(/[:\\/?*[\]]/g, '').substring(0, 31);
                XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
            }
        });
        
        if(workbook.SheetNames.length === 0) {
             toast({
                variant: 'destructive',
                title: 'Nenhuma pendência selecionada',
                description: 'Selecione pelo menos um item para exportar.',
            });
            return;
        }

        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        saveAs(blob, 'Relatorio_Pendencias_Fiscais.xlsx');
        
        toast({
            title: 'Exportação Concluída',
            description: 'O seu relatório de pendências foi descarregado.',
        });
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
    
     const getTotalSelectedItems = () => {
        return Object.values(rowSelections).reduce((acc, currentSelection) => acc + Object.keys(currentSelection).filter(key => currentSelection[key]).length, 0);
    }


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
                     <Button onClick={handleExport} disabled={getTotalSelectedItems() === 0}>
                        <Download className="mr-2 h-4 w-4" /> Exportar Relatório ({getTotalSelectedItems()})
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[70vh] p-4 border rounded-md">
                    <div className="space-y-6">
                        {sections.map(section => {
                            const isSectionChecked = selectedSections[section.id] || false;
                            const selectedCount = Object.keys(rowSelections[section.id] || {}).filter(key => rowSelections[section.id][key]).length;

                            // Clone columns to add the selection column
                            const tableColumns = [...section.columns];
                            tableColumns.unshift({
                                id: 'select',
                                header: ({ table }: any) => (
                                    <Checkbox
                                        checked={table.getIsAllRowsSelected()}
                                        onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
                                        aria-label="Selecionar todas as linhas"
                                    />
                                ),
                                cell: ({ row }: any) => (
                                    <Checkbox
                                        checked={row.getIsSelected()}
                                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                                        aria-label="Selecionar linha"
                                    />
                                ),
                                enableSorting: false,
                                enableHiding: false,
                            });
                            
                            return (
                                <div key={section.id} className="p-4 border rounded-lg">
                                    <div className="flex items-center space-x-3 mb-4">
                                        <Checkbox
                                            id={`section-${section.id}`}
                                            checked={isSectionChecked}
                                            onCheckedChange={(checked) => handleSectionToggle(section.id, !!checked)}
                                        />
                                        <Label htmlFor={`section-${section.id}`} className="text-lg font-semibold flex-grow cursor-pointer">
                                            {section.title} ({selectedCount} / {section.data.length})
                                        </Label>
                                    </div>
                                    <div className="pl-8">
                                         <DataTable 
                                            columns={tableColumns} 
                                            data={section.data} 
                                            rowSelection={rowSelections[section.id] || {}}
                                            setRowSelection={(newSelection) => {
                                                const newRowSelections = { ...rowSelections };
                                                if (typeof newSelection === 'function') {
                                                    newRowSelections[section.id] = newSelection(rowSelections[section.id] || {});
                                                } else {
                                                    newRowSelections[section.id] = newSelection;
                                                }
                                                setRowSelections(newRowSelections);
                                            }}
                                         />
                                    </div>
                                </div>
                            );
                        })}
                         {sections.length === 0 && (
                            <div className="text-center text-muted-foreground py-16">
                                <FileQuestion className="h-12 w-12 mx-auto mb-4" />
                                <p className='text-lg font-medium'>Nenhuma pendência encontrada</p>
                                <p>Todos os dados processados estão em conformidade com as verificações realizadas.</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
