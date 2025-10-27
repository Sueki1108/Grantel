
"use client"

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from '@/components/app/data-table';
import { getColumns } from '@/lib/columns-helper';

interface ResultsDisplayProps {
    results: Record<string, any[]>;
}

export function ResultsDisplay({ results }: ResultsDisplayProps) {
    const [activeTab, setActiveTab] = useState('');

    const orderedSheetNames = [
        "Notas Válidas", "Itens Válidos", "Chaves Válidas", "Saídas", "Itens Válidos Saídas",
        "Imobilizados",
        "Devoluções de Compra (Fornecedor)", "Devoluções de Clientes", "Remessas e Retornos",
        "Notas Canceladas",
        ...Object.keys(results).filter(name => name.startsWith("Original - "))
    ];
    
    useEffect(() => {
        // Set to first valid tab when results change
        const firstValidSheet = orderedSheetNames.find(sheetName => results[sheetName] && results[sheetName].length > 0);
        setActiveTab(firstValidSheet || '');
    }, [results]);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
    };
    
    const getDisplayName = (sheetName: string) => {
        const nameMap: Record<string, string> = {
            "Original - NFE": "Entradas",
            "Original - Saídas": "Saídas",
            "Original - CTE": "CTE",
            "Original - Itens": "Itens Entradas",
            "Original - Itens Saídas": "Itens Saídas",
            "Original - NFE Operação Não Realizada": "Op Não Realizada",
            "Original - NFE Operação Desconhecida": "Op Desconhecida",
            "Original - CTE Desacordo de Serviço": "CTE Desacordo",
            "Original - Itens do Sienge": "Sienge"
        };
        return nameMap[sheetName] || sheetName;
    };

    return (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className='flex-grow overflow-x-auto'>
                    <TabsList className="inline-flex h-auto">
                        {orderedSheetNames.map(sheetName => (
                            results[sheetName] && results[sheetName].length > 0 && 
                            <TabsTrigger key={sheetName} value={sheetName}>{getDisplayName(sheetName)}</TabsTrigger>
                        ))}
                    </TabsList>
                </div>
            </div>
            {orderedSheetNames.map(sheetName => (
                results[sheetName] && results[sheetName].length > 0 && (
                    <TabsContent key={sheetName} value={sheetName}>
                        <DataTable columns={getColumns(results[sheetName])} data={results[sheetName]} />
                    </TabsContent>
                )
            ))}
        </Tabs>
    );
}
