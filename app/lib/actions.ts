'use server';
import { z } from 'zod';
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import postgres from "postgres"

const sql = postgres(process.env.POSTGRES_URL!, {ssl: "require"})

const FormSchema = z.object({
	id: z.string(),
	customerId: z.string(),
	// because input type = number returns a string, this needs
	// to be checked as a number
	amount: z.coerce.number(),
	status: z.enum(["pending", "paid"]),
	date: z.string()
})

// we don't pass in id and date in the form so we ignore these in the validation
const CreateInvoice = FormSchema.omit({id: true, date: true})
const UpdateInvoice = FormSchema.omit({id: true, date: true})

export async function createInvoice(formData: FormData) {
	const { customerId, amount, status } = CreateInvoice.parse({
		customerId: formData.get("customerId"),
		amount: formData.get("amount"),
		status: formData.get("status"),
	})
	const amountInCents = amount * 100
	// YYYY-MM-DD format
	const date = new Date().toISOString().split("T")[0]

	await sql`
		INSERT INTO invoices (customer_id, amount, status, date) VALUES
		(${customerId}, ${amountInCents}, ${status}, ${date})	
	`;

	// invalidate the cache and refresh the invoices page
	// to display the most updated data
	revalidatePath("/dashboard/invoices")

	// redirect user back to the invoices page
	redirect("/dashboard/invoices")
}

export async function updateInvoice(id: string, formData: FormData){
	const { customerId, amount, status } = UpdateInvoice.parse({
		customerId: formData.get("customerId"),
		amount: formData.get("amount"),
		status: formData.get("status"),
	})

	const amountInCents = amount * 100;
	await sql`
		UPDATE invoices
		SET customer_id=${customerId}, amount=${amountInCents}, status=${status}
		WHERE id=${id}	
	`

	revalidatePath("/dashboard/invoices")
	redirect("/dashboard/invoices")
}

export async function deleteInvoice(id: string){
	await sql`DELETE FROM invoices WHERE id=${id}`;
	revalidatePath('/dashboard/invoices')
}