import  { FC } from 'react'
import ErrorPage from './ErrorPage'


const NotAllowedPageGroup: FC<{}> = () => {
    return <ErrorPage>To access to this page group admin privileges are needed</ErrorPage>
}

export default NotAllowedPageGroup;