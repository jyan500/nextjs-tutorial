'use server';
import { z } from 'zod';
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import postgres from "postgres"

const sql = postgres(process.env.POSTGRES_URL!, {ssl: "require"})

const FormSchema = z.object({
	id: z.string(),
	customerId: z.string({
		invalid_type_error: "Please select a customer."
	}),
	// because input type = number returns a string, this needs
	// to be checked as a number
	amount: z.coerce.number().gt(0, {message: "Please enter an amount greater than $0"}),
	status: z.enum(["pending", "paid"], {
		invalid_type_error: "Please select an invoice status."	
	}),
	date: z.string()
})

export type State = {
	errors?: {
		customerId?: string[];
		amount?: string[];
		status?: string[];
	};
	message?: string | null;
}

// we don't pass in id and date in the form so we ignore these in the validation
const CreateInvoice = FormSchema.omit({id: true, date: true})
const UpdateInvoice = FormSchema.omit({id: true, date: true})

export async function createInvoice(prevState: State, formData: FormData) {
	// validate form using zod
	const validatedFields = CreateInvoice.safeParse({
		customerId: formData.get("customerId"),
		amount: formData.get("amount"),
		status: formData.get("status"),
	})

	if (!validatedFields.success){
		return {
			errors: validatedFields.error.flatten().fieldErrors,
			message: "Missing Fields. Failed to Create Invoice",
		}
	}
	const { customerId, amount, status } = validatedFields.data
	const amountInCents = amount * 100
	// YYYY-MM-DD format
	const date = new Date().toISOString().split("T")[0]

	try {
		await sql`
			INSERT INTO invoices (customer_id, amount, status, date) VALUES
			(${customerId}, ${amountInCents}, ${status}, ${date})	
		`;

	}
	catch (e){
		console.error(e)
		return {
			message: "Database Error: failed to create invoice."
		}
	}
	// invalidate the cache and refresh the invoices page
	// to display the most updated data

	// redirect user back to the invoices page
	revalidatePath("/dashboard/invoices")
	redirect("/dashboard/invoices")
}

export async function updateInvoice(prevState: State, id: string, formData: FormData){
	const validatedFields = UpdateInvoice.safeParse({
		customerId: formData.get("customerId"),
		amount: formData.get("amount"),
		status: formData.get("status"),
	})

	if (!validatedFields.success){
		return {
			errors: validatedFields.error.flatten().fieldErrors,
			message: "Missing Fields. Failed to Create Invoice",
		}
	}

	const { customerId, amount, status } = validatedFields.data
	const amountInCents = amount * 100;
	try {
		await sql`
			UPDATE invoices
			SET customer_id=${customerId}, amount=${amountInCents}, status=${status}
			WHERE id=${id}	
		`
	}
	catch (e){
		console.error(e)
		return {
			message: "Database Error: failed to update invoice."
		}
	}
	revalidatePath("/dashboard/invoices")
	redirect("/dashboard/invoices")
}

export async function deleteInvoice(id: string){
	try {
		await sql`DELETE FROM invoices WHERE id=${id}`;
	}
	catch (e){
		console.error(e)
		return {
			message: "Database Error: failed to delete invoice"
		}
	}
	revalidatePath('/dashboard/invoices')
}

export async function authenticate(prevState: string | undefined, formData: FormData){
	try {
		await signIn("credentials", formData)
	}
	catch (e) {
		if (e instanceof AuthError){
			switch (e.type){
				case "CredentialsSignin":
					return "Invalid Credentials."	
				default:
					return "Something went wrong."
			}
		}
		throw e;
	}
}