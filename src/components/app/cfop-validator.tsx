
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { Factory, Wrench, HardHat, RotateCcw, Save, CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from '../ui/badge';
import type { AllClassifications, Classification, ItemData as ImobilizadoItemData } from './imobilizado-analysis';
import { cleanAndToStr } from '@/lib/utils';

// Tipos
interface SiengeConciliatedItem extends Record<string, any> {
    'Chave de acesso': string;
    'Número da Nota': string;
    'CPF/CNPJ do Emitente': string;
    'Código': string; // Código do produto no XML
    'Sienge_CFOP': string; // CFOP do Sienge
    'Descrição': string;
}

interface CfopValidatorProps {
    items: SiengeConciliatedItem[];
    competence: string | null;
    allPersistedData: AllClassifications;
    onPersistData: (allData: AllClassifications) => void;
}

// Lógica de Validação
const USO_CONSUMO_CFOPS = ['1556', '2556', '1407', '2407'];
const UTILIZADO_OBRA_CFOPS = ['1128', '2128'];

function validateCfop(classification: Classification, siengeCfop: string): 'correct' | 'incorrect' | 'unclassified' {
    if (classification === 'unclassified') return 'unclassified';
    
    const cleanSiengeCfop = cleanAndToStr(siengeCfop);

    if (classification === 'uso-consumo') {
        return USO_CONSUMO_CFOPS.includes(cleanSiengeCfop) ? 'correct' : 'incorrect';
    }
    if (classification === 'utilizado-em-obra') {
        return UTILIZADO_OBRA_CFOPS.includes(cleanSiengeCfop) ? 'correct' : 'incorrect';
    }
    if (classification === 'imobilizado') {
        // Assume imobilizado é sempre correto, pois a validação é mais complexa e feita em outra tela.
        return 'correct';
    }
    return 'unclassified';
}

export function CfopValidator({ items, competence, allPersistedData, onPersistData }: CfopValidatorProps) {
    const { toast } = useToast();
    const [classifications, setClassifications] = useState<Record<string, Classification>>({});
    const [hasChanges, setHasChanges] = useState(false);

    const getUniqueItemId = (item: SiengeConciliatedItem): string => {
        return `${cleanAndToStr(item['CPF/CNPJ do Emitente'])}-${cleanAndToStr(item['Código'])}`;
    };

    useEffect(() => {
        if (!competence) return;
        const initialClassifications: Record<string, Classification> = {};
        
        items.forEach(item => {
            const uniqueItemId = getUniqueItemId(item);
            let foundClassification: Classification | undefined = undefined;

            // 1. Tenta obter da competência atual
            foundClassification = allPersistedData[competence]?.classifications?.[uniqueItemId]?.classification;
            
            // 2. Fallback para outras competências
            if (!foundClassification) {
                for (const otherCompetence in allPersistedData) {
                    if (otherCompetence !== competence) {
                        const classification = allPersistedData[otherCompetence]?.classifications?.[uniqueItemId]?.classification;
                        if (classification) {
                            foundClassification = classification;
                            break; 
                        }
                    }
                }
            }
            initialClassifications[uniqueItemId] = foundClassification || 'unclassified';
        });

        setClassifications(initialClassifications);
        setHasChanges(false);
    }, [competence, allPersistedData, items]);

    const handleClassificationChange = (item: SiengeConciliatedItem, newClassification: Classification) => {
        const uniqueItemId = getUniqueItemId(item);
        setClassifications(prev => ({ ...prev, [uniqueItemId]: newClassification }));
        setHasChanges(true);
    };

    const handleSaveChanges = () => {
        if (!competence) return;

        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) {
            updatedPersistedData[competence] = { classifications: {}, accountCodes: {} };
        }

        Object.entries(classifications).forEach(([uniqueItemId, classification]) => {
            if (!updatedPersistedData[competence].classifications) {
                updatedPersistedData[competence].classifications = {};
            }
            updatedPersistedData[competence].classifications[uniqueItemId] = { classification };
        });

        onPersistData(updatedPersistedData);
        setHasChanges(false);
        toast({ title: 'Classificações Guardadas', description: 'As suas classificações foram guardadas para esta e futuras sessões.' });
    };

    const dataForTable = useMemo(() => {
        return items.map(item => {
            const uniqueItemId = getUniqueItemId(item);
            const classification = classifications[uniqueItemId] || 'unclassified';
            const validationStatus = validateCfop(classification, item['Sienge_CFOP']);
            return {
                ...item,
                uniqueItemId,
                classification,
                validationStatus
            };
        });
    }, [items, classifications]);
    
    if (!competence) {
        return <div className="text-center p-8">Por favor, execute a validação e selecione uma competência primeiro.</div>
    }

    const columns = getColumnsWithCustomRender(
        dataForTable,
        ['Descrição', 'Sienge_CFOP', 'Valor Total'],
        (row, id) => {
            const value = row.getValue(id as any);
            if (id === 'Valor Total' && typeof value === 'number') {
                return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
            }
            return <div>{String(value ?? '')}</div>;
        }
    );

    columns.push({
        id: 'status',
        header: 'Status Validação',
        cell: ({ row }: any) => {
            const { validationStatus, classification } = row.original;
            switch(validationStatus) {
                case 'correct': return <Badge variant="default" className='bg-green-600 hover:bg-green-700'><CheckCircle className="h-4 w-4 mr-1" /> Correto</Badge>;
                case 'incorrect': return <Badge variant="destructive"><AlertTriangle className="h-4 w-4 mr-1" /> Incorreto</Badge>;
                default: return <Badge variant="secondary">Não Classificado</Badge>;
            }
        }
    });

    columns.push({
        id: 'actions',
        header: 'Classificar como',
        cell: ({ row }: any) => {
            const item = row.original;
            return (
                <TooltipProvider>
                    <div className="flex gap-2 justify-center">
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={item.classification === 'imobilizado' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => handleClassificationChange(item, 'imobilizado')}><Factory className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Imobilizado</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={item.classification === 'uso-consumo' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => handleClassificationChange(item, 'uso-consumo')}><Wrench className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Uso e Consumo</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={item.classification === 'utilizado-em-obra' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => handleClassificationChange(item, 'utilizado-em-obra')}><HardHat className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Utilizado em Obra</p></TooltipContent></Tooltip>
                        {item.classification !== 'unclassified' && (
                             <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassificationChange(item, 'unclassified')}><RotateCcw className="h-5 w-5 text-destructive" /></Button></TooltipTrigger><TooltipContent><p>Reverter</p></TooltipContent></Tooltip>
                        )}
                    </div>
                </TooltipProvider>
            );
        }
    });

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="flex justify-end">
                <Button onClick={handleSaveChanges} disabled={!hasChanges}>
                    <Save className="mr-2 h-4 w-4" /> Guardar Alterações nas Classificações
                </Button>
            </div>
            <div className="flex-grow overflow-auto">
                <DataTable columns={columns} data={dataForTable} />
            </div>
        </div>
    );
}

