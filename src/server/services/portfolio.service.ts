import PortfolioInterface, { User, Transaction, PortfolioInterfaceWithID, NetWorth, } from "@/types/portfolio.interface";
import PortfolioModel from "@/server/models/portfolio.schema";

import { buyStock, sellStock, dividend } from "@/server/services/transaction.service";

import { getStockAnalytics, getStockBasicInfo, pullTrader } from "@/server/services/stock.service";

import { DATE_LIMIT, PORTFOLIO_STARTING_BALANCE, STOCK_DUMP_THRESHOLD } from "@/server/global.config";


export const addPortfolio = async (user: User,): Promise<{ message: string, portfolio: PortfolioInterfaceWithID | null }> => {
    try {
        const portfolio = await new PortfolioModel({
            user,
            transactions: [],
            balance: PORTFOLIO_STARTING_BALANCE,
            timeline: [
                {
                    value: PORTFOLIO_STARTING_BALANCE,
                    date: 0,
                },
            ],
            investments: [],
        } as PortfolioInterface).save();
        return {
            message: "Success",
            portfolio,
        };
    }
    catch (err: any) {
        return {
            message: err.message,
            portfolio: null,
        }
    };
};

export const verifyIDPassword = async (name: string, password: string) => {
    const portfolio: PortfolioInterfaceWithID = await PortfolioModel.findOne({ "user.name": name }, { user: true }).exec();
    if (!portfolio.user)
        return {
            message: "User not found",
        };

    if (portfolio.user.password !== password)
        return {
            message: "Incorrect password",
        };

    return {
        message: "Success",
        portfolio: portfolio._id,
    };
};

export const getAllPortfolios = async () => {
    return (await PortfolioModel.find({}, { _id: 1 }).exec()).map((portfolio) => portfolio._id) as string[];
};

export const getPortfolioById = async (portfolio_id: string): Promise<PortfolioInterfaceWithID> => {
    return await PortfolioModel.findById(portfolio_id).exec();
};

export const getPortfolioTransactions = async (portfolio_id: string, page: number) => {
    const portfolio = await getPortfolioById(portfolio_id);
    const transactions = portfolio.transactions;
    const start = page * 8;
    const end = start + 8;
    transactions.sort((a, b) => b.date - a.date);
    return transactions.slice(start, end);
};

export const getPortfolioInvestments = async (portfolio_id: string, page: number) => {
    const portfolio = await getPortfolioById(portfolio_id);
    const investments = portfolio.investments;
    const start = page * 8;
    const end = start + 8;
    investments.sort((a, b) => a.quantity - b.quantity);
    const paginated_investments = investments.slice(start, end);
    return await Promise.all(
        paginated_investments.map(async (investment) => {
            const stock = await getStockBasicInfo(investment.stock);
            return {
                stock: stock._id,
                quantity: investment.quantity,
                amount: investment.quantity * stock.price,
                change: stock.slope * stock.price * investment.quantity,
            }
        }));
};

export const performTransactions = async (id: string, transactions: Transaction[]): Promise<PortfolioInterfaceWithID> => {
    let portfolio = await getPortfolioById(id);
    for (let transaction of transactions) {
        if (transaction.type === "STOCK_PURCHASE")
            portfolio = await buyStock(portfolio, transaction);
        else if (transaction.type === "STOCK_SALE")
            portfolio = await sellStock(portfolio, transaction);
        else if (transaction.type === "STOCK_DIVIDEND")
            portfolio = await dividend(portfolio, transaction);
        else throw new Error("Invalid transaction class");
        portfolio.transactions.push(transaction);
    }

    return await PortfolioModel.findByIdAndUpdate(id,
        {
            balance: portfolio.balance,
            investments: portfolio.investments,
            transactions: portfolio.transactions,
        },
        { new: true }
    ).exec();
};

export const evaluatePortfolio = async (portfolio_id: string, date: number) => {
    const portfolio = await getPortfolioById(portfolio_id);
    const investments = portfolio.investments;
    let gross_amount = 0;
    const dumped_stocks: string[] = [];
    const transactions: Transaction[] = [];

    await Promise.all(
        investments.map(async (investment) => {
            const stock = await getStockAnalytics(investment.stock);

            const amount = investment.quantity * stock.price;
            gross_amount += amount;


            if (amount < STOCK_DUMP_THRESHOLD) {
                await pullTrader(investment.stock, portfolio_id);
                dumped_stocks.push(String(investment.stock));
                transactions.push({
                    type: "STOCK_SALE",
                    stock: investment.stock,
                    amount,
                    date,
                });
            } else {

                transactions.push({
                    type: "STOCK_DIVIDEND",
                    stock: investment.stock,
                    amount: investment.quantity * stock.dividend,
                    date,
                });
            }
        })
    );
    await performTransactions(portfolio_id, transactions);

    portfolio.transactions = portfolio.transactions.filter((transaction) => transaction.date > date - DATE_LIMIT);

    portfolio.timeline = portfolio.timeline.filter((value) => value.date > date - DATE_LIMIT);
    portfolio.timeline.sort((a, b) => a.date - b.date);

    portfolio.timeline.push({ value: portfolio.balance + gross_amount, date });

    portfolio.investments = portfolio.investments.filter((investment) => !dumped_stocks.includes(String(investment.stock)));

    await PortfolioModel.findByIdAndUpdate(
        portfolio_id,
        {
            timeline: portfolio.timeline,
            investments: portfolio.investments,
            transactions: portfolio.transactions,
        },
        { new: true }
    ).exec();

    return portfolio.timeline[portfolio.timeline.length - 1];
};

export const dumpPortfolio = async (portfolio_id: string, date: number) => {
    const portfolio = await getPortfolioById(portfolio_id);
    const investments = portfolio.investments;
    const transactions: Transaction[] = [];
    await Promise.all(
        investments.map(async (investment) => {
            const stock_price = (await getStockAnalytics(investment.stock)).price;
            transactions.push({
                type: "STOCK_SALE",
                stock: investment.stock,
                amount: investment.quantity * stock_price,
                date,
            });
        })
    );
    return await performTransactions(portfolio_id, transactions);
};
export async function getPortfolioTimelines(): Promise<{ timeline: NetWorth[]; }[]> {
    return await PortfolioModel.find({}, { timeline: 1 }).exec();
}


