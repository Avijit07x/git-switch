import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface BranchOption {
  value: string;
  label: string;
  hint?: string;
}

interface BranchComboboxProps {
  value: string | undefined;
  onChange: (value: string) => void;
  options: BranchOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  groupHeading?: string;
  disabled?: boolean;
  triggerIcon?: ReactNode;
  className?: string;
}

// Single-responsibility: searchable dropdown to pick a branch by typing.
export function BranchCombobox({
  value,
  onChange,
  options,
  placeholder = "Select",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  groupHeading,
  disabled,
  triggerIcon,
  className,
}: BranchComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 min-w-0 flex-1 justify-between gap-2 px-3 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {triggerIcon}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto min-w-[var(--radix-popover-trigger-width)] max-w-[min(640px,calc(100vw-2rem))] p-0"
      >
        <Command
          filter={(itemValue, search) => {
            return itemValue.toLowerCase().includes(search.toLowerCase())
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup heading={groupHeading}>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(v) => {
                    onChange(v);
                    setOpen(false);
                  }}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className="truncate font-medium"
                      title={option.label}
                    >
                      {option.label}
                    </span>
                    {option.hint ? (
                      <span
                        className="truncate text-xs text-muted-foreground"
                        title={option.hint}
                      >
                        {option.hint}
                      </span>
                    ) : null}
                  </div>
                  <Check
                    className={cn(
                      "ml-2 size-4 shrink-0",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
