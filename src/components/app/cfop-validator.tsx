
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, X, HelpCircle, Save, RotateCw, ListFilter, Copy } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import type { AllClassifications, CfopClassification } from './imobilizado-analysis';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cfopDescriptions } from '@/lib/cfop';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';


interface CfopValidatorProps {
    items: any[];
    competence: string | null; 
    onPersistData: (allDataToSave: AllClassifications) => void;
    allPersistedData: AllClassifications;
}

type ValidationStatus = 'all' | 'unvalidated' | 'correct' | 'incorrect' | 'verify';

type TabFilters = {
    xmlCsts: Set<string>;
    xmlPicms: Set<string>;
    xmlCfopDescriptions: Set<string>;
};

export function CfopValidator({ items, competence, onPersistData, allPersistedData }: CfopValidatorProps) {
    const { toast } = useToast();
    
    const [cfopValidations, setCfopValidations] = useState<Record<string, CfopClassification>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [activeStatusTab, setActiveStatusTab] = useState<ValidationStatus>('unvalidated');
    const [activeCfopTabs, setActiveCfopTabs] = useState<Record<string, string>>({});

    const [tabFilters, setTabFilters] = useState<Record<string, TabFilters>>({});

    useEffect(() => {
        if (competence && allPersistedData[competence]?.cfopValidations?.classifications) {
            setCfopValidations(allPersistedData[competence].cfopValidations.classifications);
        } else {
            setCfopValidations({});
        }
        setHasChanges(false);
    }, [competence, allPersistedData]);


    const handleValidationChange = (uniqueKey: string, classification: 'correct' | 'incorrect' | 'verify' | 'unvalidated') => {
        setCfopValidations(prev => {
            const newValidations = { ...prev };
            newValidations[uniqueKey] = {
                ...(newValidations[uniqueKey] || { isDifal: false }),
                classification,
            };
            return newValidations;
        });
        setHasChanges(true);
    };

    const handleSaveChanges = () => {
        if (!competence) {
            toast({ variant: "destructive", title: "Competência não definida" });
            return;
        }

        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) {
            updatedPersistedData[competence] = {};
        }
        if (!updatedPersistedData[competence].cfopValidations) {
            updatedPersistedData[competence].cfopValidations = {};
        }
        updatedPersistedData[competence].cfopValidations.classifications = cfopValidations;
        
        onPersistData(updatedPersistedData);
        setHasChanges(false);
        toast({title: 'Validações de CFOP guardadas!'});
    };
    
    
    const copyToClipboard = (text: string | number, type: string) => {
        const textToCopy = String(text);
        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: textToCopy });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
        });
    };

    const columns = useMemo(() => {
        const columnsToShow: (keyof any)[] = ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'Sienge_CFOP', 'Valor Unitário', 'pICMS', 'Valor Total'];
        
        return getColumnsWithCustomRender(
            items,
            columnsToShow,
            (row, id) => {
                const value = row.original[id as keyof typeof row.original];

                const renderCellWithCopy = (displayValue: React.ReactNode, copyValue: string | number, typeName: string) => (
                    <div className="group flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
                        <span className="truncate">{displayValue}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copyToClipboard(copyValue, typeName)}>
                            <Copy className="h-3 w-3" />
                        </Button>
                    </div>
                );
                
                const renderCellWithTooltip = (displayValue: string, fullValue: string) => (
                    <TooltipProvider>
                        <Tooltip><TooltipTrigger asChild><span>{displayValue}</span></TooltipTrigger><TooltipContent><p>{fullValue}</p></TooltipContent></Tooltip>
                    </TooltipProvider>
                );
                
                if (id === 'Fornecedor') {
                    const name = String(value || 'N/A');
                    if (name === 'N/A') return <div>N/A</div>;
                    const summarizedName = name.length > 25 ? `${name.substring(0, 25)}...` : name;
                    const display = renderCellWithTooltip(summarizedName, name);
                    return renderCellWithCopy(display, name, 'Fornecedor');
                }


                 if (id === 'pICMS') {
                    return <div className='text-center'>{typeof value === 'number' ? `${value.toFixed(2)}%` : 'N/A'}</div>;
                }

                if (['Valor Total', 'Valor Unitário'].includes(id) && typeof value === 'number') {
                    return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
                }
                
                if (id === 'Número da Nota') {
                    return renderCellWithCopy(String(value ?? ''), String(value ?? ''), 'Número da Nota');
                }

                if (id === 'Descrição' && typeof value === 'string') {
                    const summarizedDesc = value.length > 30 ? `${value.substring(0, 30)}...` : value;
                    const display = renderCellWithTooltip(summarizedDesc, value);
                    return renderCellWithCopy(display, value, 'Descrição');
                }
                
                return <div>{String(value ?? '')}</div>;
            }
        ).concat([
            {
                id: 'validation',
                header: 'Validação',
                cell: ({ row }) => {
                    const uniqueKey = `${(row.original['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(row.original['Código'] || '')}-${row.original['Sienge_CFOP']}`;
                    const validation = cfopValidations[uniqueKey]?.classification || 'unvalidated';

                    return (
                         <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                            <TooltipProvider>
                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant={validation === 'correct' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(uniqueKey, 'correct')}><Check className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Correto</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant={validation === 'incorrect' ? 'destructive' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(uniqueKey, 'incorrect')}><X className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Incorreto</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant={validation === 'verify' ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(uniqueKey, 'verify')}><HelpCircle className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar para Verificação</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant={validation === 'unvalidated' ? 'outline' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(uniqueKey, 'unvalidated')}><RotateCw className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Limpar Validação</p></TooltipContent></Tooltip>
                            </TooltipProvider>
                         </div>
                    );
                }
            },
        ]);
    }, [items, cfopValidations, toast]);

    const getFilteredItems = (status: ValidationStatus, siengeCfop: string | null = null) => {
        
        const statusFiltered = status === 'all'
            ? items
            : items.filter(item => {
                const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
                const classification = cfopValidations[uniqueKey]?.classification || 'unvalidated';
                return classification === status;
            });
            
        const cfopFiltered = siengeCfop ? statusFiltered.filter(item => item.Sienge_CFOP === siengeCfop) : statusFiltered;

        const currentFilters = tabFilters[siengeCfop || 'all'];
        if (!currentFilters) return cfopFiltered;
        
        return cfopFiltered.filter(item => {
            const cstMatch = currentFilters.xmlCsts.has(String(item['CST do ICMS']));
            const picmsMatch = currentFilters.xmlPicms.has(String(item.pICMS || '0'));
            const fullDesc = cfopDescriptions[parseInt(item['CFOP'], 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada";
            const descMatch = currentFilters.xmlCfopDescriptions.has(fullDesc);
            return cstMatch && picmsMatch && descMatch;
        });
    };

    if (!items || items.length === 0) {
        return <p className="text-center text-muted-foreground p-8">Nenhum item conciliado para validar o CFOP.</p>;
    }
    
    const FilterDialog = ({ siengeCfop, items }: { siengeCfop: string; items: any[] }) => {
        const [isDialogOpen, setIsDialogOpen] = React.useState(false);

        const availableOptions = useMemo(() => {
            const xmlCsts = new Set<string>();
            const xmlPicms = new Set<string>();
            const xmlCfopDescriptions = new Set<string>();
            items.forEach(item => {
                if (item['CST do ICMS']) xmlCsts.add(String(item['CST do ICMS']));
                if (item.pICMS !== undefined) xmlPicms.add(String(item.pICMS));
                const fullDescription = cfopDescriptions[parseInt(item['CFOP'], 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada";
                if (fullDescription) xmlCfopDescriptions.add(fullDescription);
            });
            return {
                xmlCsts: Array.from(xmlCsts).sort(),
                xmlPicms: Array.from(xmlPicms).sort((a,b) => parseFloat(a) - parseFloat(b)),
                xmlCfopDescriptions: Array.from(xmlCfopDescriptions).sort(),
            };
        }, [items]);
        
        useEffect(() => {
            if (!tabFilters[siengeCfop]) {
                setTabFilters(prev => ({
                    ...prev,
                    [siengeCfop]: {
                        xmlCsts: new Set(availableOptions.xmlCsts),
                        xmlPicms: new Set(availableOptions.xmlPicms),
                        xmlCfopDescriptions: new Set(availableOptions.xmlCfopDescriptions),
                    }
                }));
            }
        }, [siengeCfop, availableOptions]);
        
        const filters = tabFilters[siengeCfop] || { xmlCsts: new Set(availableOptions.xmlCsts), xmlPicms: new Set(availableOptions.xmlPicms), xmlCfopDescriptions: new Set(availableOptions.xmlCfopDescriptions) };
        const isFilterActive = filters.xmlCsts.size < availableOptions.xmlCsts.length ||
                               filters.xmlPicms.size < availableOptions.xmlPicms.length ||
                               filters.xmlCfopDescriptions.size < availableOptions.xmlCfopDescriptions.length;

        const handleFilterChange = (type: keyof TabFilters, value: string, checked: boolean) => {
            setTabFilters(prev => {
                const newFilters: TabFilters = { ...(prev[siengeCfop] || { xmlCsts: new Set(), xmlPicms: new Set(), xmlCfopDescriptions: new Set() }) };
                
                const newSet = new Set(newFilters[type]);
                if (checked) {
                    newSet.add(value);
                } else {
                    newSet.delete(value);
                }
                return { ...prev, [siengeCfop]: { ...newFilters, [type]: newSet } };
            });
        };
        
        const clearFilters = () => {
             setTabFilters(prev => ({
                ...prev,
                [siengeCfop]: {
                    xmlCsts: new Set(availableOptions.xmlCsts),
                    xmlPicms: new Set(availableOptions.xmlPicms),
                    xmlCfopDescriptions: new Set(availableOptions.xmlCfopDescriptions),
                }
            }));
        };
        
        const FilterCheckboxList = ({ options, filterSet, filterKey }: { options: string[], filterSet: Set<string>, filterKey: keyof TabFilters }) => (
            <ScrollArea className="h-64">
                <div className="flex flex-col gap-2 mt-2 p-1">
                    {options.map(opt => (
                        <div key={`${filterKey}-${opt}`} className="flex items-center space-x-2">
                            <Checkbox id={`${filterKey}-${opt}`} checked={filterSet.has(opt)} onCheckedChange={checked => handleFilterChange(filterKey, opt, !!checked)} />
                            <Label htmlFor={`${filterKey}-${opt}`} className="text-sm font-normal">{filterKey === 'xmlPicms' ? `${parseFloat(opt).toFixed(2)}%` : opt}</Label>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        );

        return (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant={isFilterActive ? "secondary" : "outline"} size="sm" className="ml-4">
                        <ListFilter className="mr-2 h-4 w-4" /> Filtros
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                     <DialogHeader>
                        <DialogTitle>Filtros Avançados</DialogTitle>
                        <DialogDescription>Desmarque os itens que deseja ocultar da visualização.</DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end">
                         <Button variant="ghost" size="sm" onClick={clearFilters}>Marcar Todos</Button>
                    </div>
                     <Tabs defaultValue="cfop_desc" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="cfop_desc">Descrição CFOP</TabsTrigger>
                            <TabsTrigger value="cst">CST ICMS</TabsTrigger>
                            <TabsTrigger value="picms">Alíquota ICMS</TabsTrigger>
                        </TabsList>
                        <TabsContent value="cfop_desc" className='mt-4'>
                            <div className="flex flex-col gap-2 mt-2 p-1">
                                <FilterCheckboxList options={availableOptions.xmlCfopDescriptions} filterSet={filters.xmlCfopDescriptions} filterKey="xmlCfopDescriptions" />
                            </div>
                        </TabsContent>
                        <TabsContent value="cst" className='mt-4'>
                             <div className="flex flex-col gap-2 mt-2 p-1">
                                 <FilterCheckboxList options={availableOptions.xmlCsts} filterSet={filters.xmlCsts} filterKey="xmlCsts" />
                             </div>
                        </TabsContent>
                        <TabsContent value="picms" className='mt-4'>
                             <div className="flex flex-col gap-2 mt-2 p-1">
                                <FilterCheckboxList options={availableOptions.xmlPicms} filterSet={filters.xmlPicms} filterKey="xmlPicms" />
                            </div>
                        </TabsContent>
                    </Tabs>
                     <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Fechar</Button>
                        <Button onClick={() => setIsDialogOpen(false)}>Aplicar e Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )
    };

    const statusTabs: { status: ValidationStatus; label: string }[] = [
        { status: 'unvalidated', label: 'Não Validado' },
        { status: 'correct', label: 'Correto' },
        { status: 'incorrect', label: 'Incorreto' },
        { status: 'verify', label: 'Verificar' },
        { status: 'all', label: 'Todos' },
    ];
    
    return (
        <div>
            <div className="flex justify-end gap-2 mb-4">
                <Button onClick={handleSaveChanges} disabled={!hasChanges}><Save className="mr-2 h-4 w-4" /> Guardar Validações</Button>
            </div>
            
            <Tabs value={activeStatusTab} onValueChange={(val) => setActiveStatusTab(val as ValidationStatus)} className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                     {statusTabs.map(({status, label}) => {
                         const count = getFilteredItems(status).length;
                         return <TabsTrigger key={status} value={status} disabled={count === 0}>{label} ({count})</TabsTrigger>
                     })}
                </TabsList>
                {statusTabs.map(({ status }) => {
                     const itemsForStatus = getFilteredItems(status);
                     const groupedByCfop = itemsForStatus.reduce((acc, item) => {
                        const cfop = item.Sienge_CFOP || 'N/A';
                        if (!acc[cfop]) acc[cfop] = [];
                        acc[cfop].push(item);
                        return acc;
                    }, {} as Record<string, any[]>);
                    const cfopsForStatus = Object.keys(groupedByCfop);

                    return (
                        <TabsContent key={status} value={status} className="mt-4">
                            {itemsForStatus.length > 0 ? (
                                <Tabs 
                                    value={activeCfopTabs[status] || cfopsForStatus[0]} 
                                    onValueChange={(val) => setActiveCfopTabs(prev => ({...prev, [status]: val}))}
                                    className="w-full"
                                >
                                    <div className='flex justify-between items-center mb-2'>
                                        <TabsList className="h-auto flex-wrap justify-start">
                                            {cfopsForStatus.map(cfop => (
                                                <TabsTrigger key={`${status}-${cfop}`} value={cfop}>
                                                    {cfop} ({groupedByCfop[cfop].length})
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>
                                    </div>
                                    {cfopsForStatus.map(cfop => (
                                        <TabsContent key={`${status}-${cfop}`} value={cfop} className="mt-4">
                                            <div className='flex justify-between items-center mb-2'>
                                                 <div className='text-lg font-bold'>
                                                    {cfopDescriptions[parseInt(cfop, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada"}
                                                </div>
                                                 <FilterDialog siengeCfop={cfop} items={groupedByCfop[cfop]} />
                                            </div>
                                            <DataTable columns={columns} data={getFilteredItems(status, cfop)} />
                                        </TabsContent>
                                    ))}
                                </Tabs>
                            ) : (
                                <div className="text-center text-muted-foreground p-8">Nenhum item nesta categoria.</div>
                            )}
                        </TabsContent>
                    )
                })}
            </Tabs>
        </div>
    );
}

