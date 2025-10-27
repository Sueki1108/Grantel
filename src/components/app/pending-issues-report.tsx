
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
    const [selectedItems, setSelectedItems] = React.useState<Record<string, Set<string>>>({});
    const { toast } = useToast();

    const sections = React.useMemo((): Section[] => {
        if (!processedData) return [];

        const reportSections: Section[] = [];

        // 1. Imobilizado
        const imobilizadoItems = (processedData.sheets?.['Imobilizados'] || []).filter(item => {
            const competenceKey = processedData.competence || 'default';
            const persistedForCompetence = allPersistedClassifications[competenceKey];
            const classification = persistedForCompetence?.classifications?.[item.uniqueItemId]?.classification;
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
        const notFoundInSped = processedData.keyCheckResults?.keysNotFoundInTxt || [];
        if (notFoundInSped.length > 0) {
            reportSections.push({
                id: 'sped_not_found',
                title: 'Notas Válidas Não Encontradas no SPED',
                data: notFoundInSped,
                columns: getColumns(notFoundInSped)
            });
        }

        // 3. SPED - Não na planilha
        const notInSheet = processedData.keyCheckResults?.keysInTxtNotInSheet || [];
        if (notInSheet.length > 0) {
            reportSections.push({
                id: 'sped_not_in_sheet',
                title: 'Chaves no SPED Não Encontradas nas Notas Válidas',
                data: notInSheet,
                columns: getColumns(notInSheet)
            });
        }

        // 4. SPED - Inconformidades
        const spedDivergences = processedData.keyCheckResults?.consolidatedDivergences || [];
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
            reportSections.push({
                id: 'sped_corrections',
                title: 'Modificações Realizadas no Arquivo SPED',
                data: spedCorrections.map(c => ({...c.modifications, "Linhas Modificadas": c.linesModified, "Linhas Lidas": c.linesRead})),
                columns: getColumns(spedCorrections)
            });
        }


        // 6. CFOP Incorreto/A Verificar
        const cfopValidationItems = processedData.reconciliationResults?.reconciled || [];
        const cfopIssues = cfopValidationItems.filter(item => {
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
        const resaleItems = processedData.resaleAnalysis?.xmls.map(f => ({'Ficheiro XML de Revenda': f.name})) || [];
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
        const initialItems: Record<string, Set<string>> = {};
        sections.forEach(section => {
            initialSections[section.id] = true;
            initialItems[section.id] = new Set(section.data.map((_, index) => String(index)));
        });
        setSelectedSections(initialSections);
        setSelectedItems(initialItems);
    }, [sections]);


    const handleSectionToggle = (sectionId: string, isChecked: boolean) => {
        setSelectedSections(prev => ({ ...prev, [sectionId]: isChecked }));
        const section = sections.find(s => s.id === sectionId);
        if (section) {
            const allItemKeys = new Set(section.data.map((_, index) => String(index)));
            setSelectedItems(prev => ({
                ...prev,
                [sectionId]: isChecked ? allItemKeys : new Set()
            }));
        }
    };

    const handleItemToggle = (sectionId: string, itemKey: string, isChecked: boolean) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev[sectionId] || []);
            if (isChecked) {
                newSet.add(itemKey);
            } else {
                newSet.delete(itemKey);
            }
            return { ...prev, [sectionId]: newSet };
        });

        // Update section toggle if all/none are selected
        const section = sections.find(s => s.id === sectionId);
        if (section) {
             const newSet = new Set(selectedItems[sectionId] || []);
             if(isChecked) newSet.add(itemKey); else newSet.delete(itemKey);

            if (newSet.size === section.data.length) {
                setSelectedSections(prev => ({ ...prev, [sectionId]: true }));
            } else if (newSet.size === 0) {
                setSelectedSections(prev => ({ ...prev, [sectionId]: false }));
            }
        }
    };

    const handleExport = () => {
        const workbook = XLSX.utils.book_new();

        sections.forEach(section => {
            const isSectionSelected = selectedSections[section.id];
            if (!isSectionSelected) return;

            const selectedItemIndices = Array.from(selectedItems[section.id] || []).map(Number);
            const dataToExport = section.data.filter((_, index) => selectedItemIndices.includes(index));

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
        return Object.values(selectedItems).reduce((acc, currentSet) => acc + currentSet.size, 0);
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
                             const selectedCount = selectedItems[section.id]?.size || 0;

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
                                    <div className="pl-8 space-y-2">
                                        {section.data.map((item, index) => (
                                            <div key={index} className="flex items-start space-x-2">
                                                <Checkbox
                                                    id={`item-${section.id}-${index}`}
                                                    checked={selectedItems[section.id]?.has(String(index)) || false}
                                                    onCheckedChange={(checked) => handleItemToggle(section.id, String(index), !!checked)}
                                                />
                                                <Label htmlFor={`item-${section.id}-${index}`} className="text-sm font-normal leading-snug w-full">
                                                    <div className="p-2 border rounded-md bg-muted/50">
                                                        <pre className="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(item, null, 2)}</pre>
                                                    </div>
                                                </Label>
                                            </div>
                                        ))}
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
