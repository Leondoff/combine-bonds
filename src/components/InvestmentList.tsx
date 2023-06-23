"use client";

import { Investment } from "types/portfolio.interface";
import { randomUUID } from "crypto";
import { use, useEffect, useState } from "react";

export default function InvestmentListComponent({ investments }: { investments: Investment[] }) {

     const [investment_details, setInvestmentDetails] = useState<{ name: string, amount: number, id: string }[]>([]);

     useEffect(() => {

          (Promise.all(investments.map(async (investment) => {
               const stock = await (fetch(`http://${window.location.host}/api/stock/${investment.stock}`)
                    .then((res) => {
                         return res.json()
                    })
                    .then((res) => {
                         return res;
                    }));
               console.log(stock);
               return { name: stock.name, amount: investment.quantity * stock.price, id: investment.stock };
          }))).then((res) => setInvestmentDetails(res));
     }, [investments]);
     return (
          <div style={{ height: '100vh', overflow: 'scroll', display: 'flex', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap' }}>
               {investment_details.map((investment) => <InvestmentComponent investment={investment} key={investment.name} />)}
          </div>
     );
};


function InvestmentComponent({ investment }: { investment: { name: string, amount: number, id: string } }) {
     return (
          <div style={{ border: '2px solid yellow', width: '45%', margin: '0.5rem', padding: '0.5rem' }}>
               <h3>  {investment.name} </h3>
               <p> {investment.amount.toFixed(2)}$</p>
               <button onClick={() => {
                    fetch(`http://${window.location.host}/api/transaction/`, {
                         method: 'POST',
                         headers: {
                              'Content-Type': 'application/json',
                         },
                         body: JSON.stringify({
                              id: localStorage.getItem('id'),
                              transaction: {
                                   class: "STOCK SALE",
                                   stock: investment.id,
                                   amount: investment.amount,
                              }
                         }),
                    }).then((res) => res.json())
                         .then((res) => {
                              console.log(res);
                              window.location.reload();
                         });
               }} > Sell </button>
          </div>
     );
};


export const revalidate = 0;
export const dynamic = 'force-dynamic';