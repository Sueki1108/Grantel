
"use client"

import { useState, useEffect, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from '@/components/app/data-table';
import { getColumns } from '@/lib/columns-helper';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface ResultsDisplayProps {
    results: Record<string, any[]>;
}

export function ResultsDisplay({ results }: ResultsDisplayProps) {
    const [activeTab, setActiveTab] = useState('');

    const orderedSheetNames = useMemo(() => [
        "Notas Válidas", "Itens Válidos", "Chaves Válidas", "Saídas", "Itens Válidos Saídas",
        "Imobilizados",
        "Devoluções de Compra (Fornecedor)", "Devoluções de Clientes", "Remessas e Retornos",
        "Notas Canceladas",
        ...Object.keys(results).filter(name => name.startsWith("Original - "))
    ], [results]);
    
    useEffect(() => {
        const firstValidSheet = orderedSheetNames.find(sheetName => results[sheetName] && results[sheetName].length > 0);
        if (firstValidSheet && !activeTab) {
            setActiveTab(firstValidSheet);
        }
    }, [orderedSheetNames, results, activeTab]);

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

    const memoizedTabs = useMemo(() => {
        return orderedSheetNames.map(sheetName => {
            const sheetData = results[sheetName];
            if (sheetData && sheetData.length > 0) {
                // Memoize columns for each table
                const columns = getColumns(sheetData);
                return {
                    sheetName,
                    displayName: getDisplayName(sheetName),
                    component: (
                        <TabsContent key={sheetName} value={sheetName}>
                             <DataTable columns={columns} data={sheetData} />
                        </TabsContent>
                    )
                };
            }
            return null;
        }).filter(Boolean);
    }, [results, orderedSheetNames]);

    if (!memoizedTabs || memoizedTabs.length === 0) return null;

    return (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <ScrollArea>
                    <TabsList className="inline-flex h-auto">
                        {memoizedTabs.map(tab => (
                            tab && <TabsTrigger key={tab.sheetName} value={tab.sheetName}>{tab.displayName}</TabsTrigger>
                        ))}
                    </TabsList>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </div>
            {memoizedTabs.map(tab => tab?.component)}
        </Tabs>
    );
}
