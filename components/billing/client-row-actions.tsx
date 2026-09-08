"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreVertical, ExternalLink, Edit, Mail } from "lucide-react"

interface ClientRowActionsProps {
  clientId: string
  email?: string
}

export function ClientRowActions({ clientId, email }: ClientRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={"/clients/" + clientId} className="flex items-center cursor-pointer">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={"/clients/" + clientId + "/edit"} className="flex items-center cursor-pointer">
            <Edit className="h-4 w-4 mr-2" />
            Edit Client
          </Link>
        </DropdownMenuItem>
        {email && (
          <DropdownMenuItem asChild>
            <a href={"mailto:" + email} className="flex items-center cursor-pointer">
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
