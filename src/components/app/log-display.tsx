
"use client";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LogDisplayProps {
    logs: string[];
}

export function LogDisplay({ logs }: LogDisplayProps) {
    if (!logs || logs.length === 0) {
        return null;
    }

    return (
        <Accordion type="single" collapsible className="w-full" defaultValue="item-1">
            <AccordionItem value="item-1">
                <AccordionTrigger>Mostrar/Ocultar Logs de Processamento ({logs.length} linhas)</AccordionTrigger>
                <AccordionContent>
                    <ScrollArea className="h-72 w-full rounded-md border bg-muted/50 p-4">
                        <div className="text-sm font-mono whitespace-pre-wrap">
                            {logs.map((log, index) => (
                                <p key={index} className="mb-1 last:mb-0">
                                    {log}
                                </p>
                            ))}
                        </div>
                    </ScrollArea>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}

    