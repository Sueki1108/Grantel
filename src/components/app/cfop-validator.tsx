
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, X, HelpCircle, Save, RotateCw } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import type { AllClassifications, CfopClassification } from './imobilizado-analysis';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';


interface CfopValidatorProps {
    items: any[];
    competence: string | null; 
    onPersistData: (allDataToSave: AllClassifications) => void;
    allPersistedData: AllClassifications;
}

export function CfopValidator({ items, competence, onPersistData, allPersistedData }: CfopValidatorProps) {
    const { toast } = useToast();
    
    const [cfopValidations, setCfopValidations] = useState<Record<string, CfopClassification>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [activeCfopTab, setActiveCfopTab] = useState('');

    useEffect(() => {
        if (competence && allPersistedData[competence]?.cfopValidations?.classifications) {
            setCfopValidations(allPersistedData[competence].cfopValidations.classifications);
        } else {
            setCfopValidations({});
        }
        setHasChanges(false);
    }, [competence, allPersistedData]);


    const handleValidationChange = (uniqueKey: string, classification: 'correct' | 'incorrect' | 'verify' | 'unvalidated') => {
        setCfopValidations(prev => ({
            ...prev,
            [uniqueKey]: {
                ...prev[uniqueKey],
                classification,
            }
        }));
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
    
    const getVariant = (status?: CfopClassification['classification']): "default" | "destructive" | "secondary" | "outline" => {
        switch (status) {
            case 'correct': return "default";
            case 'incorrect': return "destructive";
            case 'verify': return "secondary";
            default: return "outline";
        }
    };
    const getIcon = (status?: CfopClassification['classification']) => {
        switch (status) {
            case 'correct': return <Check className="h-4 w-4" />;
            case 'incorrect': return <X className="h-4 w-4" />;
            case 'verify': return <HelpCircle className="h-4 w-4" />;
            default: return null;
        }
    };
    
    const groupedBySiengeCfop = useMemo(() => {
        return items.reduce((acc, item) => {
            const cfop = item.Sienge_CFOP || 'N/A';
            if (!acc[cfop]) acc[cfop] = [];
            acc[cfop].push(item);
            return acc;
        }, {} as Record<string, any[]>);
    }, [items]);

    useEffect(() => {
        const firstCfop = Object.keys(groupedBySiengeCfop)[0];
        if (firstCfop) {
            setActiveCfopTab(firstCfop);
        }
    }, [groupedBySiengeCfop]);


    const columns = useMemo(() => getColumnsWithCustomRender(
        items,
        ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'Sienge_CFOP', 'Descricao CFOP', 'Valor Total'],
        (row, id) => {
            const value = row.original[id];
            if (id === 'Valor Total' && typeof value === 'number') {
                return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
            }
            if (id === 'CFOP') {
                const isDifal = cfopValidations[row.original.uniqueProductKey]?.isDifal;
                return <Badge variant={isDifal ? 'destructive' : 'secondary'}>{value}{isDifal ? ' (DIFAL)' : ''}</Badge>;
            }
             if (id === 'Sienge_CFOP') {
                return <Badge variant="outline">{value}</Badge>;
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
        {
            id: 'status',
            header: 'Status',
            cell: ({ row }) => {
                 const uniqueKey = `${(row.original['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(row.original['Código'] || '')}-${row.original['Sienge_CFOP']}`;
                const validation = cfopValidations[uniqueKey]?.classification;
                 return <Badge variant={getVariant(validation)}>{getIcon(validation)} <span className='ml-2'>{validation || 'Não validado'}</span></Badge>
            }
        }
    ]), [items, cfopValidations]);

    if (!items || items.length === 0) {
        return <p className="text-center text-muted-foreground p-8">Nenhum item conciliado para validar o CFOP.</p>;
    }

    return (
        <div>
            <div className="flex justify-end gap-2 mb-4">
                <Button onClick={handleSaveChanges} disabled={!hasChanges}><Save className="mr-2 h-4 w-4" /> Guardar Validações</Button>
            </div>
            
            <Tabs value={activeCfopTab} onValueChange={setActiveCfopTab} className="w-full">
                <TabsList className="h-auto flex-wrap justify-start">
                    {Object.entries(groupedBySiengeCfop).map(([cfop, cfopItems]) => (
                        <TabsTrigger key={cfop} value={cfop}>
                            {cfop} ({cfopItems.length})
                        </TabsTrigger>
                    ))}
                </TabsList>
                {Object.entries(groupedBySiengeCfop).map(([cfop, cfopItems]) => (
                     <TabsContent key={cfop} value={cfop} className="mt-4">
                         <DataTable columns={columns} data={cfopItems} />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}

